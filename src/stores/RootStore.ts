import {configure, makeAutoObservable} from "mobx";
import {FrameClient} from "@eluvio/elv-client-js/src/FrameClient";
import DataStore from "@/stores/DataStore";
import StreamStatusStore from "@/stores/streams/StreamStatusStore";
import StreamDetailStore from "@/stores/streams/StreamDetailStore";
import StreamListStore from "@/stores/streams/StreamListStore";
import StreamEditStore from "@/stores/streams/StreamEditStore";
import AlternateTranscodeStore from "@/stores/streams/AlternateTranscodeStore";
import RecordingCopyStore from "@/stores/streams/RecordingCopyStore";
import StreamModalStore from "@/stores/streams/StreamModalStore";
import SettingsStore from "@/stores/SettingsStore";
import ProfileStore from "@/stores/ProfileStore";
import StreamGroupStore from "@/stores/streams/StreamGroupStore";
import OutputStore from "@/stores/outputs/OutputStore";
import OutputModalStore from "@/stores/outputs/OutputModalStore";
import UserSettingsStore from "@/stores/UserSettingsStore";
import StreamSaveStore from "@/stores/streams/StreamSaveStore";
import OutputSaveStore from "@/stores/outputs/OutputSaveStore";
import VersionStore from "@/stores/VersionStore";

// Force strict mode so mutations are only allowed within actions.
configure({
  enforceActions: "always"
});

export type NetworkName = "demo" | "main" | "test";

// The central hub, instantiating and coordinating all other MobX stores.
class RootStore {
  client: InstanceType<typeof FrameClient>;
  loaded = false;
  networkInfo?: {
    name: NetworkName,
    id: string,
    configUrl: string
  };
  contentSpaceId?: string;
  errorMessage?: string;

  dataStore: DataStore;
  streamStatusStore: StreamStatusStore;
  streamDetailStore: StreamDetailStore;
  streamListStore: StreamListStore;
  streamEditStore: StreamEditStore;
  alternateTranscodeStore: AlternateTranscodeStore;
  recordingCopyStore: RecordingCopyStore;
  streamSaveStore: StreamSaveStore;
  streamModalStore: StreamModalStore;
  settingsStore: SettingsStore;
  profileStore: ProfileStore;
  streamGroupStore: StreamGroupStore;
  outputStore: OutputStore;
  outputSaveStore: OutputSaveStore;
  outputModalStore: OutputModalStore;
  userSettingsStore: UserSettingsStore;
  versionStore: VersionStore;

  constructor() {
    this.dataStore = new DataStore(this);
    this.streamStatusStore = new StreamStatusStore(this);
    this.streamDetailStore = new StreamDetailStore(this);
    this.streamListStore = new StreamListStore(this);
    this.streamEditStore = new StreamEditStore(this);
    this.alternateTranscodeStore = new AlternateTranscodeStore(this);
    this.recordingCopyStore = new RecordingCopyStore(this);
    this.streamSaveStore = new StreamSaveStore(this);
    this.streamModalStore = new StreamModalStore(this);
    this.settingsStore = new SettingsStore(this);
    this.profileStore = new ProfileStore(this);
    this.streamGroupStore = new StreamGroupStore(this);
    this.outputStore = new OutputStore(this);
    this.outputSaveStore = new OutputSaveStore(this);
    this.outputModalStore = new OutputModalStore(this);
    this.userSettingsStore = new UserSettingsStore(this);
    this.versionStore = new VersionStore(this);

    makeAutoObservable(this, {}, {autoBind: true});
  }

  *Initialize(): Generator<any, void> {
    try {
      this.client = new FrameClient({
        target: window.parent,
        timeout: 180
      });

      this.networkInfo = yield this.client.NetworkInfo();
      this.contentSpaceId = yield this.client.ContentSpaceId();

      yield Promise.all([
        this.dataStore.Initialize(),
        this.userSettingsStore.Load()
      ]);

      this.streamListStore.RestoreTableTagFilter(this.userSettingsStore.settings.tableFilters.streams);
      this.outputStore.RestoreTableTagFilter(this.userSettingsStore.settings.tableFilters.outputs);

      // Needs siteId from dataStore.Initialize; started here so it's in flight before the streams page mounts.
      this.streamListStore.PrefetchStreamList();
    } catch(error) {
      /* eslint-disable no-console */
      console.error("Failed to initialize application");
      console.error(error);

    } finally {
      this.loaded = true;
    }
  }

  *ExecuteFrameRequest ({request, Respond}: any) : Generator<any, void> {
    Respond(yield this.client.PassRequest({request, Respond}));
  }

  SetErrorMessage(message: string): void {
    this.errorMessage = message;
  }

  async OpenInFabricBrowser({libraryId, objectId}: {libraryId: string, objectId: string}): Promise<void> {
    if(!libraryId) {
      libraryId = await this.client.ContentObjectLibraryId({objectId});
    }

    await this.client.SendMessage({
      options: {
        operation: "OpenLink",
        libraryId,
        objectId
      },
      noResponse: true
    });
  }
}

export default RootStore;
