import {useEffect, useState} from "react";
import {ActionIcon, Box, Button, Flex, Group, Modal, Stack, Text, TextInput, Title} from "@mantine/core";
import {notifications} from "@mantine/notifications";
import {IconPlus, IconX} from "@tabler/icons-react";
import styles from "@/pages/outputs/modals/modals.module.css";

// Which metadata bucket (urls/<key>) a URL is saved under, based on its scheme
const PROTOCOL_SCHEMES = [
  {scheme: "rtp", key: "rtp"},
  {scheme: "srt", key: "srt"},
  {scheme: "udp", key: "mpegts"}
];

const GetUrlProtocolKey = (url) => {
  const scheme = url.trim().toLowerCase().match(/^([a-z0-9+.-]+):\/\//)?.[1];
  return PROTOCOL_SCHEMES.find(({scheme: s}) => s === scheme)?.key ?? null;
};

const UrlProtocolError = (url) => {
  if(!url) { return null; }

  return GetUrlProtocolKey(url) ? null : "URL must start with rtp, srt, or udp";
};

// Buckets a flat list of URLs into {rtp: [...], srt: [...], mpegts: [...]} based on each URL's prefix
const GroupUrlsByProtocol = (urls) => {
  return urls
    .map(url => url.trim())
    .filter(Boolean)
    .reduce((grouped, url) => {
      const key = GetUrlProtocolKey(url);
      grouped[key] = [...(grouped[key] || []), url];
      return grouped;
    }, {});
};

// Shared form for adding/editing a dedicated node. What onSave does with the result (stage a
// draft edit vs. persist immediately) is entirely up to the caller.
const NodeModal = ({opened, nodeId, node, existingNodeIds=[], title, description, onClose, onSave}) => {
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [urls, setUrls] = useState([""]);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if(opened) {
      const existingUrls = [
        ...(node?.urls?.rtp ?? []),
        ...(node?.urls?.srt ?? []),
        ...(node?.urls?.mpegts ?? [])
      ];

      setName(node?.name ?? "");
      setId(nodeId ?? "");
      setUrls(existingUrls.length > 0 ? existingUrls : [""]);
    }
  }, [opened, nodeId]);

  const urlErrors = urls.map(UrlProtocolError);
  const hasUrlErrors = urlErrors.some(Boolean);
  const idError = id && existingNodeIds.includes(id) ? "This Node ID is already in use" : null;

  const HandleUrlChange = (index, value) => {
    setUrls(prev => prev.map((url, i) => i === index ? value : url));
  };

  const HandleAddUrl = () => {
    setUrls(prev => [...prev, ""]);
  };

  const HandleRemoveUrl = (index) => {
    setUrls(prev => prev.filter((_, i) => i !== index));
  };

  const HandleSave = async() => {
    try {
      setIsSaving(true);

      await onSave(id, {
        ...node,
        name,
        urls: GroupUrlsByProtocol(urls)
      });

      onClose();
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error("Unable to save dedicated node", error);

      notifications.show({
        title: "Error",
        color: "red",
        message: "Unable to save dedicated node"
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
          <Title order={2} fz="1.375rem" c="elv-gray.9" fw={600} mb={4}>{title}</Title>
          <Text fz="0.875rem" c="elv-gray.9" fw={500}>{description}</Text>
        </Stack>
      }
      padding="24px"
      radius="6px"
      size="lg"
      classNames={{header: styles.modalHeader}}
      centered
      closeOnClickOutside={false}
    >
      <TextInput
        label="Name"
        placeholder="Enter node name"
        value={name}
        onChange={event => setName(event.target.value)}
        mb={16}
      />

      <TextInput
        label="Node ID"
        placeholder="Enter node ID"
        value={id}
        onChange={event => setId(event.target.value)}
        error={idError}
        mb={16}
      />

      <Text fz="0.875rem" fw={500} c="elv-black.3" mb={4}>URLs</Text>
      <Stack gap={8} mb={8}>
        {
          urls.map((url, index) => (
            <Group key={index} gap={8} align="flex-start" wrap="nowrap">
              <Box style={{flex: 1}}>
                <TextInput
                  placeholder="e.g. rtp://example.com:5000"
                  value={url}
                  onChange={event => HandleUrlChange(index, event.target.value)}
                  error={urlErrors[index]}
                />
              </Box>
              <ActionIcon
                size={36}
                variant="transparent"
                color="elv-gray.6"
                onClick={() => HandleRemoveUrl(index)}
                aria-label="Remove URL"
              >
                <IconX />
              </ActionIcon>
            </Group>
          ))
        }
      </Stack>
      <Button
        variant="transparent"
        size="xs"
        leftSection={<IconPlus size={14} />}
        onClick={HandleAddUrl}
        mb={24}
      >
        Add URL
      </Button>

      <Flex direction="row" align="center" justify="flex-end" gap={8}>
        <Button variant="outline" onClick={onClose} disabled={isSaving}>Cancel</Button>
        <Button onClick={HandleSave} loading={isSaving} disabled={!name || !id || hasUrlErrors || !!idError}>Save</Button>
      </Flex>
    </Modal>
  );
};

export default NodeModal;
