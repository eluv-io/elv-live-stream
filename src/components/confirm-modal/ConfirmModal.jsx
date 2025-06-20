import {useEffect, useState} from "react";
import {observer} from "mobx-react-lite";
import {Box, Button, Flex, Grid, Modal, Text} from "@mantine/core";
import AlertMessage from "@/components/alert-message/AlertMessage.jsx";

const ConfirmModal = observer(({
  message,
  customMessage,
  title,
  name,
  objectId,
  ConfirmCallback,
  CloseCallback,
  show,
  loadingText,
  cancelText="Cancel",
  confirmText="Confirm",
  // danger=false
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
      padding="24px"
      radius="6px"
      size="lg"
      centered
      closeOnClickOutside={false}
    >
      <Box>
        {
          customMessage ?
            customMessage : (
             <Text>{message}</Text>
            )
        }
        {
          name && objectId &&
          <Box mt={16}>
            <Grid gutter={2}>
              <Grid.Col span={3}>
                <Text>Stream Name:</Text>
              </Grid.Col>
              <Grid.Col span={9}>
                <Text c="elv-gray.9" fw={700}>{ name || "" }</Text>
              </Grid.Col>
            </Grid>
            <Grid>
              <Grid.Col span={3}>
                <Text>Stream ID:</Text>
              </Grid.Col>
              <Grid.Col span={9}>
                <Text>{ objectId || "" }</Text>
              </Grid.Col>
            </Grid>
          </Box>
        }
        {
          loading && loadingText ?
            loadingText : null
        }
        {
          !error ?
            null :
            <AlertMessage
              error={{message: error}}
              mt={16}
              onClick={() => setError(null)}
              styles={{root: {overflowX: "auto"}}}
            />
        }
      </Box>
      <Flex direction="row" align="center" mt="1.5rem" justify="flex-end">
        <Button type="button" variant="outline" onClick={CloseCallback} mr="0.5rem">
          {cancelText}
        </Button>
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
               
              const errorMessage = typeof error === "object" ? JSON.stringify(error, null, 2) : (error?.message || error.kind || error.toString());
              setError(errorMessage);
            } finally {
              setLoading(false);
            }
          }}
        >
          { confirmText }
        </Button>
      </Flex>
    </Modal>
  );
});

export default ConfirmModal;
