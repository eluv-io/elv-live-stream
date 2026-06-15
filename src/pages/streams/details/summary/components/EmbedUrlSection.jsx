import {ActionIcon, Divider, Group, TextInput, Tooltip} from "@mantine/core";
import {useClipboard} from "@mantine/hooks";
import {IconCopy} from "@tabler/icons-react";
import SectionTitle from "@/components/section-title/SectionTitle.jsx";

const EmbedUrlSection = ({embedUrl}) => {
  const clipboard = useClipboard({timeout: 2000});

  if(!embedUrl) { return null; }

  return (
    <>
      <Divider mb={20} mt={20} />
      <Group gap={8} mb={12}>
        <SectionTitle>Embeddable URL</SectionTitle>
        <Tooltip label={clipboard.copied ? "Copied" : "Copy"} position="bottom">
          <ActionIcon
            variant="transparent"
            c="elv-gray.6"
            size={16}
            onClick={() => clipboard.copy(embedUrl)}
          >
            <IconCopy size={16} />
          </ActionIcon>
        </Tooltip>
      </Group>
      <TextInput value={embedUrl} readOnly />
    </>
  );
};

export default EmbedUrlSection;
