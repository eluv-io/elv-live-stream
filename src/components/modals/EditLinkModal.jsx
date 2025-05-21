import {Box, Button, Flex, Modal, Select, Text} from "@mantine/core";
import CreateSavedLink from "@/pages/stream-details/transport-stream/common/CreateSavedLink.jsx";
import {useEffect, useState} from "react";
import styles from "@/pages/stream-details/transport-stream/TransportStreamPanel.module.css";
import {DataTable} from "mantine-datatable";
import AlertMessage from "@/components/alert-message/AlertMessage.jsx";
import {dataStore} from "@/stores/index.js";

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
  const [fabricNode, setFabricNode] = useState("");
  const [nodes, setNodes] = useState([]);

  const nodeData = [
    {label: "Automatic", value: ""},
    ...nodes.map(node => ({label: node, value: node}))
  ];

  useEffect(() => {
    dataStore.LoadNodes()
      .then(nodes => setNodes(nodes.fabricURIs || []));
  }, []);

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
      />
      <Box className={styles.tableWrapper} mb={29}>
        {/* Form table to generate links */}
        <DataTable
          classNames={{header: styles.tableHeader}}
          records={[
            {id: "node-form-row", url: originUrl, node: fabricNode}
          ]}
          minHeight={75}
          withColumnBorders
          columns={[
            {
              accessor: "url",
              title: "URL",
              render: () => <Text truncate="end" maw={700}>{originUrl}</Text>
            },
            {
              accessor: "node",
              title: "Fabric Node",
              width: 400,
              render: () => (
                <Select
                  data={nodeData}
                  placeholder="Select Node"
                  value={fabricNode}
                  onChange={setFabricNode}
                />
              )
            }
          ]}
        />
      </Box>

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
