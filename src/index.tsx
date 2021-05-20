import { h, render } from "preact";
import { ChakraProvider } from "@chakra-ui/react";
import { WithMetaframe } from "@metapages/metaframe-hook";
import { App } from "./App";

render(
  <ChakraProvider>
    <WithMetaframe>
      <App />
    </WithMetaframe>
  </ChakraProvider>,
  document.getElementById("root")!
);
