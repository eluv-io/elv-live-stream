import {observer} from "mobx-react-lite";
import PageContainer from "@/components/page-container/PageContainer.jsx";
import {useNavigate, useParams} from "react-router-dom";
import {outputStore} from "@/stores/index.js";
import {Divider, Group, Loader, Select} from "@mantine/core";
import {useEffect} from "react";
import SectionTitle from "@/components/section-title/SectionTitle.jsx";
import {IconCopy} from "@tabler/icons-react";
import {FABRIC_NODE_REGIONS} from "@/utils/constants.js";

const OutputDetails = observer(() => {
  const {id} = useParams();
  const navigate = useNavigate();
  const output = outputStore.outputs[id];

  useEffect(() => {
    if(!outputStore.state !== "loaded") {
      outputStore.LoadOutputs();
    }
  }, []);

  if(!output) { return <Loader />; }

  const actions = [
    {
      label: "Back",
      buttonVariant: "filled",
      color: "elv-gray.6",
      onClick: () => navigate(-1)
    },
    {
      label: "Reset",
      buttonVariant: "outline",
    },
    {
      label: "Disable",
      buttonVariant: "outline",
    },
    {
      label: "Unmap Stream",
      buttonVariant: "outline",
    }
  ];

  return (
    <PageContainer
      title={output.name}
      subtitle={id}
      actions={actions}
    >
      <SectionTitle mb={12}>
        <Group>
          Embeddable URL
          <IconCopy />
        </Group>
      </SectionTitle>

      <Divider mb={29} />

      <SectionTitle mb={12}>Fabric Geo</SectionTitle>
      <Select
        label="Geo"
        withAsterisk
        data={FABRIC_NODE_REGIONS.slice().sort((a, b) => a.label.localeCompare(b.label))}
        placeholder="Select Geo"
        clearable
        value={output.geos?.[0] ?? ""}
      />

    </PageContainer>
  );
});

export default OutputDetails;
