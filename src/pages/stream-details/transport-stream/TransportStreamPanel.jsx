import {observer} from "mobx-react-lite";
import {
  Box,
  Grid,
  Loader,
  Stack,
  Text
} from "@mantine/core";
import DisabledTooltipWrapper from "@/components/disabled-tooltip-wrapper/DisabledTooltipWrapper.jsx";
import SectionTitle from "@/components/section-title/SectionTitle.jsx";
import {dataStore} from "@/stores/index.js";
import {useEffect, useState} from "react";
import {useParams} from "react-router-dom";
import {FABRIC_NODE_REGIONS} from "@/utils/constants.js";
import ConfirmModal from "@/components/confirm-modal/ConfirmModal.jsx";
import {CheckExpiration} from "@/utils/helpers.js";
import SavedLinks from "@/pages/stream-details/transport-stream/saved-links/SavedLinks.jsx";
import QuickLinks from "@/pages/stream-details/transport-stream/quick-links/QuickLinks.jsx";

const TransportStreamPanel = observer(({url, active}) => {
  const params = useParams();

  const initModalData = {
    show: false,
    url: "",
    regionLabel: "",
    regionValue: "",
    label: ""
  };

  const [loading, setLoading] = useState(false);
  const [copyMpegTs, setCopyMpegTs] = useState(false);
  const [modalData, setModalData] = useState(initModalData);

  useEffect(() => {
    const LoadConfigData = async() => {
      let {
        copyMpegTs: copyMpegTsMeta
      } = await dataStore.LoadRecordingConfigData({objectId: params.id});
      await dataStore.LoadSrtPlayoutUrls();

      setCopyMpegTs(copyMpegTsMeta);
    };

    const LoadData = async() => {
      try {
        setLoading(true);
        await LoadConfigData();
      } finally {
        setLoading(false);
      }
    };

    if(params.id) {
      LoadData();
    }
  }, [params.id]);

  const DetailLink = (item) => {
    const regionLabel = FABRIC_NODE_REGIONS.find(data => data.value === item.region)?.label || "";

    const token = item.url?.match(/aessjc[a-zA-Z0-9]+/);
    const decoded = token ? dataStore.client.utils.DecodeSignedToken(token[0]) : {};

    return ({
      value: item.url,
      label: decoded?.payload?.ctx?.usr?.label || item.label || "",
      region: regionLabel,
      regionValue: item.region,
      startDate: decoded?.payload?.iat,
      endDate: decoded?.payload?.exp,
      expired: CheckExpiration(decoded?.payload?.exp)
    });
  };

  const srtUrls = (dataStore.srtUrlsByStream?.[params.id]?.srt_urls || [])
    .map(DetailLink);

  const quickLinkRegions = dataStore.srtUrlsByStream?.[params.id]?.quick_link_regions || {};

  if(loading) { return <Loader />; }

  return (
    <Box mb={24}>
      <DisabledTooltipWrapper
        disabled={!copyMpegTs}
        tooltipLabel="Transport Stream Source recording is not enabled"
      >
        <SectionTitle mb={8}>Quick Links</SectionTitle>
        <QuickLinks
          objectId={params.id}
          setDeleteModalData={setModalData}
          originUrl={url}
          regions={quickLinkRegions}
          active={active}
        />

        <SectionTitle mb={8}>Saved Links</SectionTitle>
        <SavedLinks
          originUrl={url}
          objectId={params.id}
          links={srtUrls}
          setDeleteModalData={setModalData}
        />
      </DisabledTooltipWrapper>
      <ConfirmModal
        show={modalData.show}
        confirmText="Delete"
        CloseCallback={() => setModalData(prevState => ({...prevState, show: false}))}
        ConfirmCallback={() => dataStore.DeleteSrtUrl({
          objectId: params.id,
          region: modalData.regionValue
        })}
        title="Delete SRT Link"
        customMessage={
          <Stack>
            <Text>Are you sure you want to delete the link?</Text>
            <Grid>
              <Grid.Col span={3}>
                <Text>Label:</Text>
              </Grid.Col>
              <Grid.Col span={9}>
                <Text truncate="end">{ modalData.label || "" }</Text>
              </Grid.Col>

              <Grid.Col span={3}>
                <Text>Region:</Text>
              </Grid.Col>
              <Grid.Col span={9}>
                <Text>{ modalData.regionLabel || "" }</Text>
              </Grid.Col>

              <Grid.Col span={3}>
                <Text>Stream URL:</Text>
              </Grid.Col>
              <Grid.Col span={9}>
                <Text style={{wordBreak: "break-all"}}>{ modalData.url || "" }</Text>
              </Grid.Col>
            </Grid>
          </Stack>
        }
      />
    </Box>
  );
});

export default TransportStreamPanel;
