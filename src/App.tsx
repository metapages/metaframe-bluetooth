import { h, FunctionalComponent } from "preact";
import { Box } from "@chakra-ui/react";
import { Bluetooth } from "./components/Bluetooth";

export const App: FunctionalComponent = () => {
  return (
    <Box w="100%" p={2}>
      <Bluetooth />
    </Box>
  );
};
