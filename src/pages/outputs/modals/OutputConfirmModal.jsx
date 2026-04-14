import {useState} from "react";
import {Button, Flex, Modal, Text} from "@mantine/core";
import styles from "./modals.module.css";

const OutputConfirmModal = ({
  show,
  title,
  description,
  confirmLabel="Confirm",
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
      onClose();
    } catch(e) {
      let errorMessage;

      if(typeof e === "string") {
        errorMessage = e;
      } else if(e instanceof Error) {
        errorMessage = e.message || e.toString();
      } else if(typeof e === "object") {
        const errorTree = e.message || e.kind;
        errorMessage = typeof errorTree === "object"
          ? JSON.stringify(errorTree, null, 2)
          : errorTree?.toString();
      } else {
        errorMessage = JSON.stringify(e, null, 2);
      }

      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      opened={show}
      onClose={onClose}
      title={title}
      padding="24px"
      radius="6px"
      size="lg"
      classNames={{header: styles.modalHeader}}
      centered
    >
      <Text c="elv-gray.9" fz="1rem" mt={12}>{description}</Text>
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
