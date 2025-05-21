import {Box, Button, Flex, Modal} from "@mantine/core";
import CreateSavedLink from "@/pages/stream-details/transport-stream/common/CreateSavedLink.jsx";
import {useState} from "react";
import AlertMessage from "@/components/alert-message/AlertMessage.jsx";

const EditLinkModal = ({
  show,
  originUrl,
  objectId,
  initialValues,
  CloseCallback,
  ConfirmCallback
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  return (
    <Modal
      opened={show}
      onClose={CloseCallback}
      title="Update SRT Saved Links"
      size="85%"
      confirmText="Update"
    >
      <CreateSavedLink
        objectId={objectId}
        originUrl={originUrl}
        showGenerateButton={false}
        initialValues={initialValues}
        hideActiveRegions={false}
        showNodeConfig
      />
      {
        !error ? null :
          <Box>
            <AlertMessage error={{message: error}} mt={16} onClick={() => setError(null)} />
          </Box>
      }

      <Flex direction="row" align="center" mt="1.5rem" justify="flex-end">
        <Button
          disabled={loading}
          variant="filled"
          loading={loading}
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
          Update
        </Button>
      </Flex>
    </Modal>
  );
};

export default EditLinkModal;
