import {observer} from "mobx-react-lite";
import {BrowserRouter} from "react-router-dom";
import {rootStore} from "@/stores";

import "@mantine/core/styles.css";
import "mantine-datatable/styles.css";
import "@mantine/notifications/styles.css";
import "@mantine/dates/styles.css";
import "mantine-contextmenu/styles.css";

import "./assets/Layout.css";
import "./assets/GlobalStyles.css";

import {AppShell, Flex, Loader, MantineProvider} from "@mantine/core";
import {Notifications} from "@mantine/notifications";

import AppRoutes from "./Routes.jsx";
import MantineTheme from "@/assets/MantineTheme";
import LeftNavigation from "@/components/left-navigation/LeftNavigation.jsx";
import DataWrapper from "@/components/data-wrapper/DataWrapper.jsx";
import ErrorBanner from "@/components/error/ErrorBanner";
import ConfirmModal from "@/components/confirm-modal/ConfirmModal.jsx";
import {ContextMenuProvider} from "mantine-contextmenu";

const App = observer(() => {
  return (
    <MantineProvider withCSSVariables theme={MantineTheme}>
      <ContextMenuProvider>
        <BrowserRouter>
          <AppShell
            padding="0"
            navbar={{width: 200, breakpoint: "sm"}}
          >
            <LeftNavigation />
            <AppShell.Main>
              <ErrorBanner />
              <Notifications zIndex={1000} position="top-right" autoClose={5000} />
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
                <ConfirmModal
                  {...rootStore.modalStore.modalData}
                />
              </DataWrapper>
            </AppShell.Main>
          </AppShell>
        </BrowserRouter>
      </ContextMenuProvider>
    </MantineProvider>
  );
});

export default App;
