import {Suspense} from "react";
import {observer} from "mobx-react-lite";
import {Outlet} from "react-router-dom";
import {AppShell, Flex, Loader} from "@mantine/core";
import {Notifications} from "@mantine/notifications";
import {rootStore} from "@/stores/index.ts";
import LeftNavigation from "@/components/left-navigation/LeftNavigation.jsx";
import DataWrapper from "@/components/data-wrapper/DataWrapper.jsx";
import ErrorBanner from "@/components/error/ErrorBanner";
import ConfirmModal from "@/components/confirm-modal/ConfirmModal.jsx";
import OutputModals from "@/pages/outputs/OutputModals.jsx";

// Layout route for the data router (see Routes.jsx / App.jsx). Renders the
// persistent app chrome once and an <Outlet /> for the matched page - this is
// what lets StreamDetailsPage use useBlocker to intercept in-app navigation
// (sidebar links, browser back/forward, programmatic navigate()), which only
// works under the data router API, not the plain <BrowserRouter> this replaced.
const AppLayout = observer(() => {
  return (
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
              <Suspense fallback={<Flex justify="center" align="center" h="100%"><Loader /></Flex>}>
                <Outlet />
              </Suspense> :
              (
                <Flex justify="center" align="center">
                  <Loader />
                </Flex>
              )
          }
          <ConfirmModal
            {...rootStore.modalStore.modalData}
          />
          <OutputModals />
        </DataWrapper>
      </AppShell.Main>
    </AppShell>
  );
});

export default AppLayout;