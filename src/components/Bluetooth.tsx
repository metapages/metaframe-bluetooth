import { h, FunctionalComponent as FC } from "preact";
import {
  useCallback,
  useContext,
  useEffect,
  useState,
  useRef,
} from "preact/hooks";
import { Unibabel } from "unibabel";
import { MetaframeContext, useHashParamJson } from "@metapages/metaframe-hook";
import { Option, OptionsMenuButton } from "@metapages/metaframe-ui-widgets";
import {
  Alert,
  AlertDescription,
  AlertIcon,
  Button,
  HStack,
  Icon,
  Table,
  Tr,
  Tbody,
  Td,
  Thead,
  VStack,
} from "@chakra-ui/react";
import { RiBluetoothConnectFill, RiBluetoothFill } from "react-icons/ri";

const appOptions: Option[] = [
  {
    name: "serviceUUID",
    displayName: "Service UUID",
    type: "string",
  },
  {
    name: "displayoutputs",
    displayName: "Display outputs (performance cost)",
    default: false,
    type: "boolean",
  },
];

type InfoBlob = {
  title?: string;
  message?: string;
  status: "info" | "error" | "warning" | "success" | undefined;
};

type OptionBlob = {
  serviceUUID?: string;
  displayoutputs?: boolean;
};

type OutputType = boolean | number[] | undefined | string;
type Outputs = { [key in string]: OutputType };

enum State {
  Begin = "Begin",
  Scanning = "Scanning",
  Connecting = "Connecting",
  ChoosingService = "ChoosingService",
  GettingService = "GettingService",
  GettingCharacteristics = "GettingCharacteristics",
  FinishedSuccess = "FinishedSuccess",
  FinishedError = "FinishedError",
}

export const Bluetooth: FC = () => {
  const [optionsInHashParams] = useHashParamJson<OptionBlob>("options");
  // bluetooth service uuid to filter for
  const serviceUUID = optionsInHashParams && optionsInHashParams.serviceUUID;
  const displayoutputs: boolean | undefined =
    optionsInHashParams && optionsInHashParams.displayoutputs;

  // characteristis output uuids can be mapped to user-defined strings for better ergodynamics
  const [keyAliases, setKeyAliases] =
    useState<{ [key in string]: string } | undefined>(undefined);
  useEffect(() => {
    const newKeyAliases: { [key in string]: string } | undefined =
      optionsInHashParams &&
      Object.fromEntries(
        Object.keys(optionsInHashParams)
          .filter((k) => k !== serviceUUID)
          .map((key: string) => [key, (optionsInHashParams as any)[key]])
      );
    setKeyAliases(newKeyAliases);
  }, [optionsInHashParams, setKeyAliases]);

  const metaframe = useContext(MetaframeContext);

  const [bluetoothState, setBluetoothState] = useState<State>(State.Begin);

  const [characteristics, setCharacteristics] = useState<
    BluetoothRemoteGATTCharacteristic[]
  >([]);

  const [server, setServer] =
    useState<BluetoothRemoteGATTServer | undefined>(undefined);
  const [service, setService] =
    useState<BluetoothRemoteGATTService | undefined>(undefined);

  const [info, setInfo] = useState<InfoBlob[]>([]);

  // A song and dance to efficiently render outputs
  // Only used for rendering when debugging
  const outputsRef = useRef<Outputs>({});
  // Only used for rendering when debugging
  const [outputs, setOutputs] = useState<Outputs>({});

  const setMetaframeOutputs = useCallback(
    (currentOutputs: Outputs) => {
      if (metaframe.setOutputs && currentOutputs) {
        metaframe.setOutputs(currentOutputs);
      }
    },
    [metaframe.setOutputs]
  );

  const reset = useCallback(() => {
    // just set new values, then useEffect cleanup methods above get triggered doing
    // the actual cleanup work
    setService(undefined);
    setServer(undefined);
    setCharacteristics([]);
    // setCharacteristicsLastUpdated([]);
    setInfo([]);
    setBluetoothState(State.Begin);
  }, []);

  // if the serviceUUID changes, reset
  useEffect(() => {
    reset();
  }, [serviceUUID, reset]);

  const scan = useCallback(async () => {
    reset();
    setBluetoothState(State.Scanning);
    let infoBlobs: InfoBlob[] = [];

    const appendInfo = (blob: InfoBlob) => {
      infoBlobs = infoBlobs.concat([blob]);
      setInfo(infoBlobs);
    };

    appendInfo({ status: "info", message: "scanning..." });

    try {
      if (!navigator.bluetooth) {
        setBluetoothState(State.FinishedError);
        appendInfo({
          status: "error",
          message:
            "Browser does not support bluetooth https://caniuse.com/#feat=web-bluetooth",
        });
        return;
      }

      const options: RequestDeviceOptions = serviceUUID
        ? {
            filters: serviceUUID ? [{ services: [serviceUUID] }] : [],
          }
        : {
            acceptAllDevices: true,
          };
      appendInfo({
        status: "info",
        message: `Requesting Bluetooth Device...serviceUUID=${serviceUUID}`,
      });

      const device: BluetoothDevice = await navigator.bluetooth.requestDevice(
        options
      );

      setBluetoothState(State.Connecting);

      if (!device) {
        setBluetoothState(State.FinishedError);
        appendInfo({ status: "error", message: "No device found" });
        return;
      }

      if (!device) {
        setBluetoothState(State.FinishedError);
        appendInfo({ status: "error", message: "No device.gatt found" });
        return;
      }

      appendInfo({
        status: "info",
        message: "Connecting to GATT Server...",
      });

      const server: BluetoothRemoteGATTServer = await device!.gatt!.connect();

      appendInfo({
        status: "info",
        message: "Getting Service...",
      });

      setBluetoothState(State.ChoosingService);
      setServer(server);
    } catch (error) {
      setBluetoothState(State.FinishedError);
      appendInfo({ status: "error", message: `${error}` });
    }
  }, [
    serviceUUID,
    setBluetoothState,
    setInfo,
    setCharacteristics,
    setService,
    setServer,
    reset,
  ]);

  // when we get a new server, get the services, or choose one
  useEffect(() => {
    if (!server || !serviceUUID) {
      return;
    }
    let infoBlobs: InfoBlob[] = [];

    const appendInfo = (blob: InfoBlob) => {
      infoBlobs = infoBlobs.concat([blob]);
    };

    (async () => {
      // choose a service id from the list
      try {
        appendInfo({
          status: "info",
          message: "getPrimaryService",
        });
        const service: BluetoothRemoteGATTService =
          await server.getPrimaryService(serviceUUID);
        setBluetoothState(State.GettingCharacteristics);
        setService(service);

        const characteristics: BluetoothRemoteGATTCharacteristic[] =
          await service.getCharacteristics();
        characteristics.sort((a, b) =>
          a.uuid > b.uuid ? 1 : b.uuid > a.uuid ? -1 : 0
        );
        setCharacteristics(characteristics);
        // must not be done sequentially https://bugs.chromium.org/p/chromium/issues/detail?id=664863
        await Promise.all(characteristics.map((c) => c.startNotifications()));
        setBluetoothState(State.FinishedSuccess);
        setInfo([{ status: "success", message: "Connected" }]);
      } catch (error) {
        setBluetoothState(State.FinishedError);
        appendInfo({ status: "error", message: `${error}` });
      }
    })();
  }, [server, serviceUUID, setCharacteristics, setBluetoothState, setInfo]);

  // update charactaristic outouts to metaframe outputs
  useEffect(() => {
    if (!metaframe.setOutputs || characteristics.length === 0) {
      return;
    }

    const characteristicDisposers: (() => void)[] = [];
    try {
      characteristics.forEach((characteristic, index) => {
        const c = characteristic;

        const listener = () => {
          try {
            const key =
              keyAliases && keyAliases[c.uuid] ? keyAliases![c.uuid] : c.uuid;
            const possibleArrayBuffer: ArrayBuffer | undefined =
              c.value?.buffer;
            let val: OutputType;
            if (possibleArrayBuffer) {
              if (possibleArrayBuffer.byteLength === 1) {
                val = new Uint8Array(possibleArrayBuffer)[0] === 1;
              } else if (possibleArrayBuffer.byteLength % 4 === 0) {
                // assume floats
                val = Array.from(new Float32Array(possibleArrayBuffer));
              } else {
                val = Unibabel.bufferToBase64(possibleArrayBuffer);
              }
            }

            const newoutputs: Outputs = {
              [key]: val,
            };
            setMetaframeOutputs(newoutputs);

            if (displayoutputs) {
              Object.keys(newoutputs).forEach(
                (k) => (outputsRef.current[key] = newoutputs[key])
              );
              setOutputs(newoutputs);
            }
          } catch (err) {
            console.error(err);
          }
        };

        characteristic.addEventListener("characteristicvaluechanged", listener);
        characteristicDisposers.push(() => {
          characteristic.removeEventListener(
            "characteristicvaluechanged",
            listener
          );
        });
      });
    } catch (error) {
      setBluetoothState(State.FinishedError);
      const infos = info.concat([{ status: "error", message: `${error}` }]);
      setInfo(infos);
    }
    return () => {
      while (characteristicDisposers.length > 0)
        characteristicDisposers.pop()!();
    };
  }, [
    keyAliases,
    characteristics,
    displayoutputs,
    setOutputs,
    setMetaframeOutputs,
    setInfo,
  ]);

  let icon = RiBluetoothFill;
  let onClick: () => void = scan;
  let disabled = false;
  let text = "Scan";

  switch (bluetoothState) {
    case State.Begin:
      text =
        serviceUUID && serviceUUID.length > 4
          ? "Scan"
          : "<= Service UUID required ";
      disabled = !serviceUUID || serviceUUID.length === 0;
      onClick = scan;
      icon = RiBluetoothFill;
      break;
    case State.Scanning:
      text = "Scan";
      onClick = scan;
      disabled = true;
      icon = RiBluetoothFill;
      break;
    case State.Connecting:
      text = "Scan";
      onClick = scan;
      break;
    case State.ChoosingService:
      text = "Disconnect";
      onClick = reset;
      break;
    case State.GettingService:
      text = "Disconnect";
      onClick = reset;
      break;
    case State.GettingCharacteristics:
      text = "Disconnect";
      onClick = reset;
      break;
    case State.FinishedSuccess:
      text = "Disconnect";
      onClick = reset;
      icon = RiBluetoothConnectFill;
      break;
    case State.FinishedError:
      text = "Reset";
      onClick = reset;
      break;
    default:
  }

  return (
    <VStack spacing={2} align="stretch">
      <HStack spacing={2} alignItems="center">
        <Icon boxSize="2em" color="blue" as={icon} />
        <OptionsMenuButton
          options={appOptions.concat(
            characteristics.map((c) => {
              return {
                name: c.uuid,
                displayName: `Map characteristic ${c.uuid} to name`,
                type: "string",
              };
            })
          )}
        />

        <Button size="lg" onClick={onClick} isDisabled={disabled}>
          {text}
        </Button>
      </HStack>
      <VStack align="stretch">
        {info.length > 0
          ? info.map((i) => (
              <Alert status={i.status || "error"}>
                <AlertIcon />
                <AlertDescription>{i.message}</AlertDescription>
              </Alert>
            ))
          : null}

        {displayoutputs ? (
          <Table variant="simple">
            <Thead>
              <Tr>
                <Td>Name/ID</Td>
                <Td>Value</Td>
              </Tr>
            </Thead>
            <Tbody>
              {Object.keys(outputsRef.current)
                .sort()
                .filter((key) => key!!)
                .map((key) => (
                  <Tr>
                    <Td>{key}</Td>
                    {/* <Td>{outputsRef.current[key] ? new Uint16Array(outputsRef.current[key] as ArrayBuffer).toString() : ""}</Td> */}
                    <Td>
                      {outputsRef.current[key]
                        ? stringifyValue(outputsRef.current[key])
                        : ""}
                    </Td>
                  </Tr>
                ))}
            </Tbody>
          </Table>
        ) : null}
      </VStack>
    </VStack>
  );
};

const stringifyValue = (val: OutputType) => {
  if (Array.isArray(val)) {
    return `[${val.join(", ")}]`;
  }
  switch (typeof val) {
    case "number":
      return `${val}`;
    case "string":
      return val;
    case "object":
      return JSON.stringify(val);
    default:
      return `${val}`;
  }
};
