import {useEffect, useState} from "react";
import {observer} from "mobx-react-lite";
import {Box, Button, Flex, Grid, List, Modal, Text} from "@mantine/core";
import AlertMessage from "@/components/alert-message/AlertMessage.jsx";

const ConfirmModal = observer(({
  message,
  customMessage,
  title,
  detailData={},
  batchSummary,
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
          (Object.keys(detailData ?? {}).length > 0) &&
          <Box mt={16}>
            {
              detailData.name &&
              <Grid gutter={2}>
                <Grid.Col span={3}>
                  <Text>{ detailData.nameKey ?? "Name:" }</Text>
                </Grid.Col>
                <Grid.Col span={9}>
                  <Text c="elv-gray.9" fw={700}>{ detailData.name ?? "" }</Text>
                </Grid.Col>
              </Grid>
            }
            {
              detailData.id &&
              <Grid>
                <Grid.Col span={3}>
                  <Text>{ detailData.idKey }</Text>
                </Grid.Col>
                <Grid.Col span={9}>
                  <Text>{ detailData.id }</Text>
                </Grid.Col>
              </Grid>
            }
          </Box>
        }
        {
          batchSummary &&
          <List mt={12}>
            {batchSummary.readyCount > 0 && (
              <List.Item>
                <Text>{batchSummary.readyCount} {batchSummary.readyCount === 1 ? "stream is" : "streams are"} ready to {batchSummary.op.toLowerCase()}</Text>
              </List.Item>
            )}
            {batchSummary.notReadyCount > 0 && (
              <List.Item>
                <Text>{batchSummary.notReadyCount} {batchSummary.notReadyCount === 1 ? "stream is" : "streams are"} {batchSummary.skipLabel} and will be skipped</Text>
              </List.Item>
            )}
          </List>
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
              onClose={() => setError(null)}
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
              let errorMessage;

              if(typeof error === "string") {
                errorMessage = error;
              } else if(error instanceof Error) {
                if(error.message || error.kind) {
                  errorMessage = JSON.stringify((error?.message || error.kind), null, 2);
                }

                errorMessage = error.toString();
              } else if(typeof error === "object") {
                const errorTree = error.message || error.kind;

                if(typeof errorTree === "object") {
                  errorMessage = JSON.stringify((errorTree), null, 2);
                } else {
                  errorMessage = errorTree.toString();
                }
              } else {
                errorMessage = JSON.stringify(error, null, 2);
              }

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
