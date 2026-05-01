import {useState} from "react";
import {Button, Flex, Grid, Modal, Text} from "@mantine/core";
import {notifications} from "@mantine/notifications";
import NotificationMessage from "@/components/notification-message/NotificationMessage.jsx";
import styles from "./modals.module.css";
import {outputModalStore} from "@/stores/index.js";

const OutputConfirmModal = ({
  show,
  title,
  description,
  confirmLabel="Confirm",
  closeOnConfirm=true,
  successTitle,
  successMessage,
  errorMessage,
  onConfirm,
  onClose
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(undefined);

  const HandleConfirm = async() => {
    try {
      setError(undefined);
      setLoading(true);
      await onConfirm();
      if(successTitle) {
        notifications.show({
          title: successTitle,
          message: <NotificationMessage>{successMessage}</NotificationMessage>
        });
      }
      if(closeOnConfirm) { onClose(); }
    } catch(e) {
      let errorDetail;

      if(typeof e === "string") {
        errorDetail = e;
      } else if(e instanceof Error) {
        errorDetail = e.message || e.toString();
      } else if(typeof e === "object") {
        const errorTree = e.message || e.kind;
        errorDetail = typeof errorTree === "object"
          ? JSON.stringify(errorTree, null, 2)
          : errorTree?.toString();
      } else {
        errorDetail = JSON.stringify(e, null, 2);
      }

      setError(errorDetail);
      if(errorMessage) {
        notifications.show({
          title: "Error",
          color: "red",
          message: errorMessage
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      opened={show}
      onClose={() => {
        onClose();
        setError(null);
      }}
      title={title}
      padding="24px"
      radius="6px"
      size="lg"
      classNames={{header: styles.modalHeader}}
      centered
      closeOnClickOutside={false}
    >
      <Text c="elv-gray.9" fz="1rem" mt={12}>{description}</Text>
      {
        outputModalStore.outputName &&
        <Grid gutter={2} mt={12}>
          <Grid.Col span={3}>
            <Text>Output Name:</Text>
          </Grid.Col>
          <Grid.Col span={9}>
            <Text c="elv-gray.9" fw={700}>{ outputModalStore.outputName }</Text>
          </Grid.Col>
        </Grid>
      }
      <Text c="elv-gray.9" fz="1rem" mt={16}>Are you sure you want to continue?</Text>
      {
        error &&
        <Text c="elv-red.5" fz="0.875rem" mt={8}>{error}</Text>
      }
      <Flex direction="row" align="center" mt="1.5rem" justify="flex-end" gap={8}>
        <Button
          variant="filled"
          loading={loading}
          disabled={loading}
          onClick={HandleConfirm}
        >
          {confirmLabel}
        </Button>
      </Flex>
    </Modal>
  );
};

export default OutputConfirmModal;
