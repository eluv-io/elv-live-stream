import {observer} from "mobx-react-lite";
import {outputModalStore, outputStore} from "@/stores/index.ts";
import CreateOutputModal from "@/pages/outputs/modals/CreateOutputModal.jsx";
import MapToStreamModal from "@/pages/outputs/modals/MapToStreamModal.jsx";
import OutputConfirmModal from "@/pages/outputs/modals/OutputConfirmModal.jsx";
import EditOutputTagsModal from "@/pages/outputs/modals/EditOutputTagsModal.jsx";

const OutputModals = observer(() => {
  const tagRecords = outputModalStore.modalSlugs
    .filter(slug => outputStore.outputs[slug])
    .map(slug => ({...outputStore.outputs[slug], slug}));

  return (
    <>
      <CreateOutputModal
        show={outputModalStore.activeModal === "create"}
        onCloseModal={outputModalStore.CloseModal}
      />
      <MapToStreamModal
        show={outputModalStore.activeModal === "map"}
        onCloseModal={outputModalStore.CloseModal}
        outputs={outputModalStore.modalSlugs}
      />
      <EditOutputTagsModal
        opened={outputModalStore.activeModal === "tags"}
        onClose={outputModalStore.CloseModal}
        records={tagRecords}
      />
      <OutputConfirmModal
        show={outputModalStore.isConfirmModalOpen}
        title={outputModalStore.confirmConfig?.title}
        name={outputModalStore.confirmConfig?.name}
        description={outputModalStore.confirmConfig?.description}
        confirmLabel={outputModalStore.confirmConfig?.confirmLabel}
        closeOnConfirm={outputModalStore.confirmConfig?.closeOnConfirm ?? true}
        successTitle={outputModalStore.confirmConfig?.successTitle}
        successMessage={outputModalStore.confirmConfig?.successMessage}
        errorMessage={outputModalStore.confirmConfig?.errorMessage}
        onConfirm={outputModalStore.Confirm}
        onClose={outputModalStore.CloseModal}
      />
    </>
  );
});

export default OutputModals;
