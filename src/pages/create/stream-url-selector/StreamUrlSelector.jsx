import {observer} from "mobx-react-lite";
import {useEffect, useState} from "react";
import {dataStore} from "@/stores/index.js";
import {Box, Select, Tabs, TextInput} from "@mantine/core";

const StreamUrlPanelContent = observer(({
  node,
  protocol,
  url,
  customUrl,
  urlOptions,
  nodeOptions,
  onNodeChange,
  onProtocolChange,
  onUrlChange,
  onCustomUrlChange,
  urlError,
  customUrlError,
  showNodeSelector=false
}) => {
  return (
    <>
      {
        showNodeSelector &&
        <Select
          name="nodes"
          label="Node"
          placeholder={dataStore.loadedDedicatedNodes ? "Select Node" : "Loading Nodes..."}
          required={showNodeSelector}
          value={node}
          data={nodeOptions}
          onChange={onNodeChange}
          mb={18}
          allowDeselect={false}
        />
      }
      <Select
        name="protocol"
        label="Protocol"
        required={true}
        value={protocol}
        data={[
          {label: "MPEG-TS", value: "mpegts"},
          {label: "RTMP", value: "rtmp"},
          {label: "SRT", value: "srt"},
          {label: "Custom", value: "custom"}
        ]}
        onChange={onProtocolChange}
        mb={18}
        allowDeselect={false}
      />

      <Box mb={29}>
        {protocol === "custom" ? (
          <TextInput
            label="URL"
            name="customUrl"
            placeholder="Enter a custom URL"
            value={customUrl}
            onChange={event => {
              const {value} = event.target;
              onCustomUrlChange(value);
            }}
            error={customUrlError}
            withAsterisk
          />
        ) : (
          <Select
            key={protocol}
            label="URL"
            name="url"
            data={urlOptions.map(u => ({label: u, value: u}))}
            placeholder={(!showNodeSelector && !dataStore.loadedUrls) ? "Loading URLs..." : "Select URL"}
            value={url}
            onChange={onUrlChange}
            error={urlError}
            disabled={showNodeSelector && !node}
            withAsterisk
          />
        )}
      </Box>
    </>
  );
});

const StreamUrlSelector = observer(({
  activeTab,
  onActiveTabChange,
  onProtocolChange,
  onUrlChange,
  onCustomUrlChange,
  onNodeChange,
  urlError,
  customUrlError
}) => {
  // Dedicated internal settings
  const [dedicatedProtocol, setDedicatedProtocol] = useState("mpegts");
  const [dedicatedUrl, setDedicatedUrl] = useState("");
  const [dedicatedCustomUrl, setDedicatedCustomUrl] = useState("");
  const [dedicatedUrlOptions, setDedicatedUrlOptions] = useState([]);
  const [dedicatedNode, setDedicatedNode] = useState("");

  // Public internal settings
  const [publicProtocol, setPublicProtocol] = useState("mpegts");
  const [publicUrl, setPublicUrl] = useState("");
  const [publicCustomUrl, setPublicCustomUrl] = useState("");
  const [publicUrlOptions, setPublicUrlOptions] = useState([]);

  useEffect(() => {
    const urls = publicProtocol === "custom"
      ? []
      : Object.keys(dataStore.liveStreamUrls || {})
        .filter(u => dataStore.liveStreamUrls[u].protocol === publicProtocol && !dataStore.liveStreamUrls[u].active);
    setPublicUrlOptions(urls);
  }, [publicProtocol, dataStore.liveStreamUrls]);

  useEffect(() => {
    if(dedicatedNode && dedicatedProtocol) {
      const options = dataStore.DedicatedNodeUrls({nodeId: dedicatedNode, protocol: dedicatedProtocol});
      setDedicatedUrlOptions(options);
    }
  }, [dedicatedNode, dedicatedProtocol]);

  return (
    <Tabs
      value={activeTab}
      onChange={(tab) => {
        const protocol = (tab === "public") ?
          publicProtocol : dedicatedProtocol;
        const url = (tab === "public") ?
          (publicProtocol === "custom" ? publicCustomUrl : publicUrl) : dedicatedUrl;
        onUrlChange(url);
        onProtocolChange(protocol);
        onActiveTabChange(tab);
      }}
    >
      <Tabs.List w="fit-content" mb={12}>
        <Tabs.Tab value="dedicated">Dedicated</Tabs.Tab>
        <Tabs.Tab value="public">Public</Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="dedicated">
        <StreamUrlPanelContent
          showNodeSelector
          node={dedicatedNode}
          nodeOptions={dataStore.dedicatedNodesList}
          protocol={dedicatedProtocol}
          url={dedicatedUrl}
          customUrl={dedicatedCustomUrl}
          urlOptions={dedicatedUrlOptions}
          onProtocolChange={(value) => {
            onProtocolChange(value);
            setDedicatedProtocol(value);
            setDedicatedUrlOptions(dataStore.DedicatedNodeUrls({nodeId: value}));
            onUrlChange("");
          }}
          onUrlChange={(value) => {
            onUrlChange(value);
            setDedicatedUrl(value);
          }}
          onCustomUrlChange={(value) => {
            onCustomUrlChange(value);
            setDedicatedCustomUrl(value);
          }}
          onNodeChange={(value) => {
            onNodeChange(value);
            setDedicatedNode(value);
            onUrlChange("");
          }}
          urlError={urlError}
          customUrlError={customUrlError}
        />
      </Tabs.Panel>
      <Tabs.Panel value="public">
        <StreamUrlPanelContent
          protocol={publicProtocol}
          url={publicUrl}
          customUrl={publicCustomUrl}
          urlOptions={publicUrlOptions}
          onProtocolChange={(value) => {
            onProtocolChange(value);
            setPublicProtocol(value);
            onUrlChange("");
          }}
          onUrlChange={(value) => {
            onUrlChange(value);
            setPublicUrl(value);
          }}
          onCustomUrlChange={(value) => {
            onCustomUrlChange(value);
            setPublicCustomUrl(value);
          }}
          urlError={urlError}
          customUrlError={customUrlError}
        />
      </Tabs.Panel>
    </Tabs>
  );
});

export default StreamUrlSelector;
