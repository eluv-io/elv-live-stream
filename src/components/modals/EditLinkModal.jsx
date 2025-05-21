import {Box, Button, Flex, Modal} from "@mantine/core";
import CreateSavedLink from "@/pages/stream-details/transport-stream/common/CreateSavedLink.jsx";
import {useState} from "react";
import AlertMessage from "@/components/alert-message/AlertMessage.jsx";
import {useForm} from "@mantine/form";
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

  const [nodes, setNodes] = useState([]);
  const [fabricNode, setFabricNode] = useState("");

  const initialStartDate = initialValues.startDate ? new Date(initialValues.startDate) : new Date();
  const initialEndDate = initialValues.endDate ? new Date(initialValues.endDate) : null;

  const [startDate, setStartDate] = useState(initialStartDate);
  const [endDate, setEndDate] = useState(initialEndDate);

  const parentForm = useForm({
    mode: "uncontrolled",
    initialValues: {
      region: initialValues.region,
      label: initialValues.label,
      useSecure: true,
      startDate: initialStartDate, // controlled
      endDate: initialEndDate // controlled
    }
  });

  parentForm.watch("region", ({value}) => {
    dataStore.LoadNodes({region: value})
      .then(nodes => {
        const fabricNodes = [...new Set(nodes.fabricURIs || [])];
        setNodes(fabricNodes);
      });
  });

  const nodeData = [
    {label: "Automatic", value: ""},
    ...nodes.map(node => ({label: node, value: node}))
  ];

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
        form={parentForm}
        showNodeConfig
        nodeData={nodeData}
        startDate={startDate}
        endDate={endDate}
        setStartDate={setStartDate}
        setEndDate={setEndDate}
        fabricNode={fabricNode}
        setFabricNode={setFabricNode}
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
