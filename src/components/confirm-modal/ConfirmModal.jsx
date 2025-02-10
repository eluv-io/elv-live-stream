import {useEffect, useState} from "react";
import {observer} from "mobx-react-lite";
import {Button, Flex, Loader, Modal, Text} from "@mantine/core";

const ConfirmModal = observer(({
  message,
  title,
  ConfirmCallback,
  CloseCallback,
  show,
  loadingText,
  cancelText="Cancel",
  confirmText="Confirm",
  danger=false
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setError(null);
  }, [show]);

  return (
    <Modal
      opened={show}
      onClose={CloseCallback}
      title={title}
      padding="32px"
      radius="6px"
      size="lg"
      centered
      closeOnClickOutside={false}
    >
      <Text>{message}</Text>
      {
        loading && loadingText ?
          <Text>{loadingText}</Text> : null
      }
      {
        !error ? null :
          <div className="modal__error">
            Error: { error }
          </div>
      }
      <Flex direction="row" align="center" mt="1.5rem" justify="flex-end">
        <Button type="button" variant="outline" onClick={CloseCallback} mr="0.5rem" color={danger ? "elv-red.7" : "elv-violet"}>
          {cancelText}
        </Button>
        <Button
          disabled={loading}
          variant="filled"
          color={danger ? "elv-red.7" : "elv-violet"}
          onClick={async () => {
            try {
              setError(undefined);
              setLoading(true);
              await ConfirmCallback();
              CloseCallback();
            } catch(error) {
              // eslint-disable-next-line no-console
              console.error(error);
              setError(error?.message || error.kind || error.toString());
            } finally {
              setLoading(false);
            }
          }}
        >
          {loading ? <Loader type="dots" size="xs" color="elv-gray.7" /> : confirmText}
        </Button>
      </Flex>
    </Modal>
  );
});

export default ConfirmModal;
