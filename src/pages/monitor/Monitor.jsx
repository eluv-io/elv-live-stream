import {useState} from "react";
import {observer} from "mobx-react-lite";
import {Loader, TextInput} from "@mantine/core";
import {useDebouncedValue} from "@mantine/hooks";

import {dataStore, streamStore} from "@/stores";
import {SortTable} from "@/utils/helpers";
import {STATUS_TEXT} from "@/utils/constants";
import VideoContainer from "@/components/video-container/VideoContainer.jsx";

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
    <div className="monitor">
      <div className="page-header monitor__page-header">
        <div>
          Monitor
        </div>
        <button className="button__secondary" onClick={() => streamStore.ToggleMonitorPreviews()}>
          { streamStore.showMonitorPreviews ? "Hide Previews" : "Show Previews"}
        </button>
      </div>
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
              <div className="monitor__grid-items">
                {
                  streams
                    .map((stream, index) => {
                      return (
                        <div key={stream.slug} className="monitor__grid-item-container">
                          <VideoContainer index={index} slug={stream.slug} showPreview={streamStore.showMonitorPreviews} />
                          <div className="monitor__grid-item-details">
                            <div className="monitor__grid-item-details-content">
                              <div className="monitor__grid-item-details-top">
                                <div className="monitor__grid-item-title">
                                  { stream.title }
                                </div>
                                <div className="monitor__grid-item-id">
                                  { stream.objectId || "" }
                                </div>
                              </div>
                              <div className="monitor__grid-item-details-bottom">
                                {
                                  !stream.status ? <div /> :
                                    <div className={`monitor__grid-item-status ${stream.status === "running" ? "monitor__grid-item-details--green" : ""}`}>
                                      {STATUS_TEXT[stream.status]}
                                    </div>
                                }
                                {
                                  stream.embedUrl &&
                                  <a
                                    className="monitor__grid-item-link"
                                    href={stream.embedUrl}
                                    target="_blank" rel="noreferrer"
                                  >
                                    <div className="monitor__grid-item-link-text">
                                      Embed URL
                                    </div>
                                  </a>
                                }
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                }
              </div>
      }
    </div>
  );
});

export default Monitor;
