import {Suspense} from "react";
import {observer} from "mobx-react-lite";
import {Outlet} from "react-router-dom";
import {AppShell, Flex, Loader} from "@mantine/core";
import {Notifications} from "@mantine/notifications";
import {rootStore} from "@/stores/index.ts";
import LeftNavigation from "@/components/left-navigation/LeftNavigation.jsx";
import DataWrapper from "@/components/data-wrapper/DataWrapper.jsx";
import ErrorBanner from "@/components/error/ErrorBanner";
import UpdateBanner from "@/components/version/UpdateBanner.jsx";
import ConfirmModal from "@/components/confirm-modal/ConfirmModal.jsx";
import OutputModals from "@/pages/outputs/OutputModals.jsx";

// Required by useBlocker (StreamDetailsPage) for in-app nav guarding.
const AppLayout = observer(() => {
  return (
    <AppShell
      padding="0"
      navbar={{width: 200, breakpoint: "sm"}}
    >
      <LeftNavigation />
      <AppShell.Main>
        <UpdateBanner />
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