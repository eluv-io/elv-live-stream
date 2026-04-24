import {observer} from "mobx-react-lite";
import {Box, Button, Divider, Flex, Loader, Modal, Stack, Text, TextInput, Title} from "@mantine/core";
import {dataStore, streamEditStore} from "@/stores/index.js";
import {useForm} from "@mantine/form";
import {useEffect, useState} from "react";
import {notifications} from "@mantine/notifications";
import NotificationMessage from "@/components/notification-message/NotificationMessage.jsx";
import StreamUrlSelector from "@/pages/create/stream-url-selector/StreamUrlSelector.jsx";
import SectionTitle from "@/components/section-title/SectionTitle.jsx";
import styles from "@/pages/outputs/modals/modals.module.css";

const DuplicateStreamModal = observer(({opened, onClose, records=[]}) => {
  const [isSaving, setIsSaving] = useState(false);
  const [activeUrlTypeTab, setActiveUrlTypeTab] = useState("");
  const [loadedDedicatedNodes, setLoadedDedicatedNodes] = useState(false);

  useEffect(() => {
    Promise.all([
      dataStore.LoadStreamUrls(),
      dataStore.loadedDedicatedNodes ? Promise.resolve() : dataStore.LoadDedicatedNodes()
    ]).then(() => {});
  }, []);

  useEffect(() => {
    if(dataStore.loadedDedicatedNodes) {
      setActiveUrlTypeTab(dataStore.dedicatedNodesList.length > 0 ? "dedicated" : "public");
      setLoadedDedicatedNodes(true);
    }
  }, [dataStore.loadedDedicatedNodes]);

  useEffect(() => {
    if(opened) {
      form.setFieldValue("name", records[0]?.title ? `(Copy) ${records[0].title}` : "");
    }
  }, [opened]);

  const form = useForm({
    mode: "uncontrolled",
    initialValues: {
      name: records[0]?.title ? `(Copy) ${records[0].title}` : "",
      url: "",
      protocol: "mpegts",
      customUrl: "",
      nodeId: ""
    }
  });

  const HandleSubmit = async () => {
    try {
      setIsSaving(true);

      const {name, url: formUrl, customUrl, protocol, nodeId} = form.getValues();
      const url = protocol === "custom" ? customUrl : formUrl;

      for(const {libraryId, slug, versionHash} of records) {
        await streamEditStore.DuplicateStream({
          libraryId,
          originalVersionHash: versionHash,
          originalSlug: slug,
          name,
          url,
          protocol,
          nodeId: activeUrlTypeTab === "dedicated" ? nodeId : undefined
        });

        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      notifications.show({
        title: "New output created",
        message: <NotificationMessage>Successfully duplicated stream</NotificationMessage>
      });

      form.reset();
      onClose();
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to duplicate stream", error);

      notifications.show({
        title: "Error",
        color: "red",
        message: "Unable to duplicate stream"
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Stack gap={0} mb={20}>
          <Title order={2} fz="1.375rem" c="elv-gray.9" fw={600}>Duplicate Stream</Title>
          <Text fz="0.875rem" c="elv-gray.8">Duplicate this stream and quickly update settings for a fast setup.</Text>
        </Stack>
      }
      padding="24px"
      radius="6px"
      size="lg"
      classNames={{header: styles.modalHeader}}
      centered
      closeOnClickOutside={false}
    >
      <form onSubmit={form.onSubmit(HandleSubmit)}>
        <Box>
          <SectionTitle mb={8}>Name</SectionTitle>
          <TextInput
            placeholder="Enter stream name"
            key={form.key("name")}
            {...form.getInputProps("name")}
          />

          <Divider mb={20} mt={20} />

          <SectionTitle mb={8}>Streaming Protocol</SectionTitle>
          <Text fz={12} c="elv-gray.6" mb={10}>Select a protocol to see available pre-allocated URLs.</Text>
          {
            loadedDedicatedNodes ?
              <StreamUrlSelector
                activeTab={activeUrlTypeTab}
                onActiveTabChange={setActiveUrlTypeTab}
                onProtocolChange={(value) => {
                  form.setFieldValue("protocol", value);
                  form.setFieldValue("url", "");
                }}
                onUrlChange={(value) => form.setFieldValue("url", value)}
                onCustomUrlChange={(value) => form.setFieldValue("customUrl", value)}
                onNodeChange={(value) => form.setFieldValue("nodeId", value)}
                urlError={form.errors.url}
                customUrlError={form.errors.customUrl}
              /> :
              <Flex mb={25} mt={25}><Loader /></Flex>
          }
        </Box>
        <Flex direction="row" align="center" mt="1.5rem" justify="flex-end">
          <Button type="submit" loading={isSaving} disabled={isSaving}>Create</Button>
        </Flex>
      </form>
    </Modal>
  );
});

export default DuplicateStreamModal;
