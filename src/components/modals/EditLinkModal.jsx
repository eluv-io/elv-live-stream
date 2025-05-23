import {Box, Button, Flex, Modal} from "@mantine/core";
import SrtLinkForm from "@/pages/stream-details/transport-stream/common/SrtLinkForm.jsx";
import {useEffect, useState} from "react";
import AlertMessage from "@/components/alert-message/AlertMessage.jsx";
import {dataStore} from "@/stores/index.js";
import {observer} from "mobx-react-lite";

const EditLinkModal = observer(({
  show,
  title="Update SRT Saved Link",
  originUrl,
  objectId,
  initialValues,
  showLinkConfig=true,
  CloseCallback,
  ConfirmCallback
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [loadingFabricNode, setLoadingFabricNode] = useState(false);

  const [formData, setFormData] = useState({});
  const [nodes, setNodes] = useState([]);
  const [originalFormData, setOriginalFormData] = useState({});
  const [isDirty, setIsDirty] = useState(false);

  const initialStartDate = initialValues.startDate ? new Date(initialValues.startDate) : new Date();
  const initialEndDate = initialValues.endDate ? new Date(initialValues.endDate) : null;

  const HandleChange = ({key, value}) => {
    setFormData(prev => ({
      ...prev,
      [key]: value
    }));
  };

  useEffect(() => {
    const data = {
      region: initialValues.region ?? "",
      label: initialValues.label ?? "",
      useSecure: true,
      startDate: initialStartDate ?? null,
      endDate: initialEndDate ?? null,
      fabricNode: ""
    };

      setLoadingFabricNode(true);
      setNodes([]);

      dataStore.LoadNodes({region: formData.region})
        .then(nodes => {
          const fabricNodes = [...new Set(nodes.fabricURIs || [])];

          if(originUrl) {
            const urlObject = new URL(originUrl);
            const matchedNode = fabricNodes.filter(node => {
              return node.includes(urlObject.hostname);
            });

            data.fabricNode = matchedNode.length > 0 ? matchedNode[0] : "";
          }

          setNodes(fabricNodes);
          setLoadingFabricNode(false);
        });

      setFormData(data);
      setOriginalFormData(Object.assign({}, data));
  }, [initialValues]);

  useEffect(() => {
    if(formData.region === originalFormData.region) { return; }

    dataStore.LoadNodes({region: formData.region})
      .then(nodes => {
        const fabricNodes = [...new Set(nodes.fabricURIs || [])];

        if(originUrl) {
          const urlObject = new URL(originUrl);
          const matchedNode = fabricNodes.filter(node => {
            return node.includes(urlObject.hostname);
          });

          HandleChange({
            key: "fabricNode",
            value: matchedNode.length > 0 ? matchedNode[0] : ""
          });
        }

        setNodes(fabricNodes);
        setLoadingFabricNode(false);
      });
  }, [formData.region, originUrl]);

  useEffect(() => {
    if(!showLinkConfig) {
      setIsDirty(true);
      return;
    }

    const dirty = Object.keys(formData).some(
      key => formData[key] !== originalFormData[key]
    );
    setIsDirty(dirty);
  }, [formData, originalFormData]);

  const nodeData = [
    {label: "Automatic", value: ""},
    ...nodes.map(node => ({label: node, value: node}))
  ];

  return (
    <Modal
      opened={show}
      onClose={CloseCallback}
      title={title}
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
        loadingFabricNode={loadingFabricNode}
      />
      {
        !error ? null :
          <Box>
            <AlertMessage error={{message: error}} mt={16} onClick={() => setError(null)} />
          </Box>
      }

      <Flex direction="row" align="center" mt="1.5rem" justify="flex-end">
        <Button
          disabled={
            loading ||
            (showLinkConfig && (!formData.region || !formData.label)) ||
            !isDirty
          }
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
