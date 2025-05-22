import {Box, Button, Flex, Modal} from "@mantine/core";
import SrtLinkForm from "@/pages/stream-details/transport-stream/common/SrtLinkForm.jsx";
import {useEffect, useState} from "react";
import AlertMessage from "@/components/alert-message/AlertMessage.jsx";
import {dataStore} from "@/stores/index.js";
import {observer} from "mobx-react-lite";

const EditLinkModal = observer(({
  show,
  originUrl,
  objectId,
  initialValues,
  showLinkConfig=true,
  CloseCallback,
  ConfirmCallback
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [formData, setFormData] = useState({});
  const [nodes, setNodes] = useState([]);

  const initialStartDate = initialValues.startDate ? new Date(initialValues.startDate) : new Date();
  const initialEndDate = initialValues.endDate ? new Date(initialValues.endDate) : null;

  useEffect(() => {
    setFormData({
      region: initialValues.region ?? "",
      label: initialValues.label ?? "",
      useSecure: true,
      startDate: initialStartDate ?? null,
      endDate: initialEndDate ?? null,
      fabricNode: ""
    });
  }, [initialValues]);

  useEffect(() => {
    dataStore.LoadNodes({region: formData.region})
      .then(nodes => {
        const fabricNodes = [...new Set(nodes.fabricURIs || [])];
        setNodes(fabricNodes);
      });
  }, [formData.region]);

  const HandleChange = ({key, value}) => {
    setFormData(prev => ({
      ...prev,
      [key]: value
    }));
  };

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
      <SrtLinkForm
        objectId={objectId}
        originUrl={originUrl}
        showGenerateButton={false}
        hideActiveRegions={false}
        formData={formData}
        HandleFormChange={HandleChange}
        nodeData={nodeData}
        showNodeConfig
        showLinkConfig={showLinkConfig}
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
              await ConfirmCallback(formData);
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
});

export default EditLinkModal;
