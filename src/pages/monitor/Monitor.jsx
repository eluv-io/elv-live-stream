import {useState} from "react";
import {observer} from "mobx-react-lite";
import {Anchor, Box, Flex, Grid, Loader, Text, TextInput} from "@mantine/core";
import {useDebouncedValue} from "@mantine/hooks";

import {dataStore, streamStore} from "@/stores";
import {SortTable} from "@/utils/helpers";
import {STATUS_MAP, STATUS_TEXT} from "@/utils/constants";
import VideoContainer from "@/components/video-container/VideoContainer.jsx";
import PageContainer from "@/components/page-container/PageContainer.jsx";

const Monitor = observer(() => {
  const [filter, setFilter] = useState("");
  const [debouncedFilter] = useDebouncedValue(filter, 200);

  const streams = !streamStore.streams ? undefined :
    Object.values(streamStore.streams || {})
      .filter(record => {
        return (
          !debouncedFilter ||
          record.title.toLowerCase().includes(debouncedFilter.toLowerCase()) ||
          record.objectId.toLowerCase().includes(debouncedFilter.toLowerCase())
        );
      })
      .sort(SortTable({sortStatus: {columnAccessor: "title", direction: "asc"}}));

  return (
    <PageContainer
      title="Monitor"
      actions={[
        {
          label: streamStore.showMonitorPreviews ? "Hide Previews" : "Show Previews",
          variant: "outline",
          onClick: () => streamStore.ToggleMonitorPreviews()
        }
      ]}
    >
      <TextInput
        maw={400}
        placeholder="Search by name or object ID"
        mb="md"
        value={filter}
        onChange={event => setFilter(event.target.value)}
      />
      {
        !dataStore.tenantId ? null :
          !streams ?
            <div style={{maxWidth: "200px"}}>
              <Loader />
            </div> :
            streams.length === 0 ? (debouncedFilter ? "No Matching Streams" : "No Streams Found") :
              <Grid gutter="lg">
                {
                  streams.map((stream, index) => {
                    return (
                      <Grid.Col key={stream.slug} span="content">
                        <Flex w={300} h={300} direction="column">
                          <VideoContainer index={index} slug={stream.slug} showPreview={streamStore.showMonitorPreviews} />
                          <Flex flex={1} p="0.5rem 0.75rem" bg="gray.9">
                            <Flex direction="column" justify="space-between" w="100%">
                              <Box>
                                <Text fw={700} c="elv-neutral.0">
                                  { stream.title }
                                </Text>
                                <Text c="elv-neutral.0" fz="0.6rem">
                                  { stream.objectId || "" }
                                </Text>
                              </Box>
                              <Flex align="flex-end" justify="space-between">
                                {
                                  !stream.status ?
                                    <div /> :
                                    (
                                      <Text fz="0.6rem" c={(stream.status === STATUS_MAP.RUNNING) ? "elv-green.5" : "elv-neutral.0"}>
                                        {STATUS_TEXT[stream.status]}
                                      </Text>
                                    )
                                }
                                {
                                  stream.embedUrl &&
                                  <Anchor
                                    href={stream.embedUrl}
                                    underline="never"
                                    target="_blank"
                                    rel="noreferrer"
                                    fz="0.6rem"
                                    style={{textDecoration: "none"}}
                                  >
                                    Embed URL
                                  </Anchor>
                                }
                              </Flex>
                            </Flex>
                          </Flex>
                        </Flex>
                      </Grid.Col>
                    );
                  })
                }
              </Grid>
      }
    </PageContainer>
  );
});

export default Monitor;
