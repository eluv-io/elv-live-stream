import {createBrowserRouter, RouterProvider} from "react-router-dom";

import "@mantine/core/styles.css";
import "mantine-datatable/styles.css";
import "@mantine/notifications/styles.css";
import "@mantine/dates/styles.css";
import "./assets/GlobalStyles.css";

import {MantineProvider} from "@mantine/core";

import routes from "./Routes.jsx";
import MantineTheme from "@/assets/MantineTheme";

const router = createBrowserRouter(routes);

const App = () => {
  return (
    <MantineProvider theme={MantineTheme}>
      <RouterProvider router={router} />
    </MantineProvider>
  );
};

export default App;