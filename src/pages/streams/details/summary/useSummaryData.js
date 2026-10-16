import {useEffect, useState} from "react";
import {useParams} from "react-router-dom";
import {streamStatusStore, streamDetailStore, recordingCopyStore} from "@/stores/index.ts";

/**
 * Owns all async data loading for SummaryPanel.
 * Returns derived state; SummaryPanel is a pure layout coordinator.
 */
const useSummaryData = ({slug, libraryId}) => {
  const params = useParams();
  const objectId = params.id;

  const [status, setStatus] = useState({state: streamStatusStore.streams?.[slug]?.status});
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [liveRecordingCopies, setLiveRecordingCopies] = useState({});
  const [loading, setLoading] = useState(false);
  const [embedUrl, setEmbedUrl] = useState(null);

  const LoadLiveRecordingCopies = async() => {
    try {
      setLoading(true);
      let copies = await recordingCopyStore.FetchLiveRecordingCopies({objectId});

      Object.keys(copies || {}).forEach(id => (copies[id]["_id"] = id));
      setLiveRecordingCopies(copies || {});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const LoadData = async() => {
      await streamDetailStore.LoadSummaryData({objectId, libraryId, slug});
    };

    const LoadStatus = async() => {
      try {
        setLoadingStatus(true);
        const statusResponse = await streamStatusStore.CheckStatus({objectId, slug, update: true});
        setStatus(statusResponse);
      } finally {
        setLoadingStatus(false);
      }
    };

    const LoadEmbedUrl = async() => {
      const url = await streamDetailStore.EmbedUrl({objectId});
      setEmbedUrl(url);
    };

    LoadData();
    LoadLiveRecordingCopies();
    LoadStatus();
    LoadEmbedUrl();
  }, [objectId]);

  return {
    objectId,
    status,
    loadingStatus,
    liveRecordingCopies,
    loading,
    embedUrl,
    LoadLiveRecordingCopies
  };
};

export default useSummaryData;
