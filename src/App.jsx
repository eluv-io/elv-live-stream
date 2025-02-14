import {observer} from "mobx-react-lite";
import {BrowserRouter} from "react-router-dom";
import {rootStore} from "@/stores";

import "@mantine/core/styles.css";
import "mantine-datatable/styles.css";
import "@mantine/notifications/styles.css";
import "@mantine/dates/styles.css";

import {AppShell, Flex, Loader, MantineProvider} from "@mantine/core";
import {Notifications} from "@mantine/notifications";

import AppRoutes from "./Routes.jsx";
import MantineTheme from "@/assets/MantineTheme";
import LeftNavigation from "@/components/left-navigation/LeftNavigation.jsx";
import DataWrapper from "@/components/data-wrapper/DataWrapper.jsx";
import ErrorBanner from "@/components/error/ErrorBanner";

const App = observer(() => {
  return (
    <MantineProvider withCSSVariables theme={MantineTheme}>
      <BrowserRouter>
        <AppShell padding="0" withBorder={false} navbar={{width: 210, breakpoint: "sm"}}>
          <LeftNavigation />
          <AppShell.Main>
            <ErrorBanner />
            <Notifications zIndex={1000} position="top-right" autoClose={5000} />
            <div className="main-content">
              <DataWrapper>
                {
                  rootStore.loaded ?
                    <AppRoutes /> :
                    (
                      <Flex justify="center" align="center">
                        <Loader />
                      </Flex>
                    )
                }
              </DataWrapper>
            </div>
          </AppShell.Main>
        </AppShell>
      </BrowserRouter>
    </MantineProvider>
  );
});

export default App;
