import {useEffect, useState} from "react";
import {observer} from "mobx-react-lite";
import {dataStore, editStore, streamStore, rootStore} from "@/stores";
import {Radio, Select, TextInput} from "@/components/Inputs.jsx";
import {useNavigate} from "react-router-dom";
import {ENCRYPTION_OPTIONS, RETENTION_OPTIONS} from "@/utils/constants";
import {Accordion, Alert, Box, Button, Flex, Loader, Text} from "@mantine/core";
import {IconAlertCircle} from "@tabler/icons-react";
import AudioTracksTable from "@/pages/create/audio-tracks-table/AudioTracksTable.jsx";
import {notifications} from "@mantine/notifications";
import classes from "./Create.module.css";
import ProbeConfirmation from "@/pages/ProbeConfirmation";

const FORM_KEYS = {
  BASIC: "BASIC",
  ADVANCED: "ADVANCED",
  DRM: "DRM"
};

const Permissions = observer(({permission, UpdateCallback}) => {
  const permissionLevels = rootStore.client.permissionLevels;

  return (
    <Select
      label="Permission"
      labelDescription="Set a permission level."
      tooltip={
        Object.values(rootStore.client.permissionLevels).map(({short, description}) =>
          <Flex
            key={`permission-info-${short}`}
            gap="1rem"
            lh={1.25}
            pb={5}
            maw={500}
          >
            <Flex flex="0 0 25%">{ short }:</Flex>
            <Text fz="sm">{ description }</Text>
          </Flex>
        )
      }
      value={permission}
      onChange={UpdateCallback}
      options={
        Object.keys(permissionLevels || {}).map(permissionName => (
          {
            label: permissionLevels[permissionName].short,
            value: permissionName
          }
        ))
      }
    />
  );
});

const PlaybackEncryption = observer(({drmFormData, UpdateCallback}) => {
  const options = ENCRYPTION_OPTIONS;

  return (
    <Select
      label="Playback Encryption"
      labelDescription="Select a playback encryption option. Enable Clear or Digital Rights Management (DRM) copy protection during playback."
      formName="playbackEncryption"
      options={options}
      defaultOption={{
        value: "",
        label: "Select Encryption"
      }}
      value={drmFormData.encryption}
      onChange={event => UpdateCallback({event, key: "encryption"})}
      tooltip={
        options.map(({label, title, id}) =>
          <Flex
            key={`encryption-info-${id}`}
            gap="1rem"
            lh={1.25}
            pb={5}
            maw={500}
          >
            <Flex flex="0 0 25%">{ label }:</Flex>
            <Text fz="sm">{ title }</Text>
          </Flex>
        )
      }
    />
  );
});

const AdvancedSection = observer(({
  advancedData,
  AdvancedUpdateCallback,
  drmFormData,
  DrmUpdateCallback,
  AdvancedSettingsCallback,
  objectProbed=false,
  audioTracks,
  audioFormData,
  setAudioFormData,
  setShowProbeConfirmation,
  objectData,
  useAdvancedSettings,
  DisableProbeButton,
  ladderProfilesData,
  playoutProfile,
  setPlayoutProfile
}) => {
  return (
    <>
      <Accordion
        value={useAdvancedSettings}
        onValueChange={AdvancedSettingsCallback}
      >
        <Accordion.Item value="advanced-item">
          <Accordion.Control>Advanced Settings</Accordion.Control>
          <Accordion.Panel>
            <>
              <Select
                label="Retention"
                labelDescription="Select a retention period for how long stream parts will exist until they are removed from the fabric."
                formName="retention"
                options={RETENTION_OPTIONS}
                value={advancedData.retention}
                onChange={event => AdvancedUpdateCallback({
                  key: "retention",
                  event
                })
                }
              />

              <Box mb={16}>
                <Select
                  label="Playout Ladder"
                  formName="playoutLadder"
                  options={ladderProfilesData}
                  defaultOption={{
                    value: "",
                    label: "Select Ladder Profile"
                  }}
                  style={{width: "100%", marginBottom: "0"}}
                  helperText={ladderProfilesData.length > 0 ? null : "No profiles are configured. Create a profile in Settings."}
                  value={playoutProfile}
                  onChange={(event) => setPlayoutProfile(event.target.value)}
                />
              </Box>

              <PlaybackEncryption
                drmFormData={drmFormData}
                UpdateCallback={({event, key}) => DrmUpdateCallback({
                  key,
                  event
                })}
              />

              {
                !objectProbed &&
                <Alert
                  variant="light"
                  color="blue"
                  mt={24}
                  mb={24}
                  icon={<IconAlertCircle/>}
                  classNames={{
                    wrapper: classes.alertRoot
                  }}
                >
                  <Flex justify="space-between" align="center">
                    <Text>
                      To apply audio stream settings, object must be probed first.
                    </Text>
                    <Button
                      variant="subtle"
                      onClick={() => setShowProbeConfirmation(true)}
                      disabled={
                        objectData !== null ||
                        DisableProbeButton()
                      }
                    >
                      Probe
                    </Button>
                  </Flex>
                </Alert>
              }
              <div className="form__section-header">Audio</div>
              <AudioTracksTable
                records={audioTracks}
                audioFormData={audioFormData}
                setAudioFormData={setAudioFormData}
                disabled={!objectProbed}
              />
            </>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </>
  );
});

const Create = observer(() => {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      dataStore.LoadAccessGroups(),
      dataStore.LoadLibraries(),
      dataStore.LoadStreamUrls()
    ])
      .finally(() => setLoading(false));
  }, []);

  const [basicFormData, setBasicFormData] = useState({
    url: "",
    protocol: "mpegts",
    name: "",
    description: "",
    displayTitle: "",
    libraryId: "",
    accessGroup: "",
    permission: "editable"
  });

  const [advancedData, setAdvancedData] = useState({
    retention: 86400
  });

  const [useAdvancedSettings, setUseAdvancedSettings] = useState();

  const [drmFormData, setDrmFormData] = useState({
    encryption: ""
  });

  const [audioFormData, setAudioFormData] = useState(null);

  const [showProbeConfirmation, setShowProbeConfirmation] = useState(false);

  const navigate = useNavigate();
  const [isCreating, setIsCreating] = useState(false);
  const [objectData, setObjectData] = useState(null);
  const [audioTracks, setAudioTracks] = useState([]);
  const [playoutProfile, setPlayoutProfile] = useState("Default");

  const urls = basicFormData.protocol === "custom" ?
    [] :
    Object.keys(dataStore.liveStreamUrls || {})
      .filter(url => dataStore.liveStreamUrls[url].protocol === basicFormData.protocol && !dataStore.liveStreamUrls[url].active);

  const defaultOption = dataStore.ladderProfiles?.default ?
    {
      label: dataStore.ladderProfiles.default.name,
      value: dataStore.ladderProfiles.default.name
    } : {};
  const ladderProfilesData = dataStore.ladderProfiles ?
    [
      defaultOption,
      ...dataStore.ladderProfiles.custom.map(item => ({label: item.name, value: item.name}))
    ] : [];

  useEffect(() => {
    const LoadConfigData = async () => {
      const {audioStreams, audioData} = await dataStore.LoadStreamProbeData({
        objectId: objectData.objectId
      });

      setAudioTracks(audioStreams);
      setAudioFormData(audioData);
    };

    if(objectData !== null) {
      LoadConfigData();
    }
  }, [objectData, streamStore.streams]);

  const UpdateFormData = ({formKey, key, value}) => {
    const FORM_MAP = {
      "BASIC": {
        data: basicFormData,
        callback: setBasicFormData
      },
      "ADVANCED": {
        data: advancedData,
        callback: setAdvancedData
      },
      "DRM": {
        data: drmFormData,
        callback: setDrmFormData
      }
    };
    const {data, callback} = FORM_MAP[formKey];
    const newData = Object.assign({}, data);
    newData[key] = value;

    callback(newData);
  };

  const HandleSubmit = async (event) => {
    event.preventDefault();
    setIsCreating(true);

    try {
      const formData = {
        basicFormData,
        advancedData,
        drmFormData,
        playoutProfile
      };
      let objectId;

      if(objectData === null) {
        const response = await editStore.InitLiveStreamObject({
          ...formData
        });

        objectId = response.objectId;
      } else {
        objectId = objectData.objectId;
        await editStore.UpdateLiveStreamObject({
          objectId,
          slug: objectData.slug,
          audioFormData,
          ...formData
        });
      }

      navigate(`/streams/${objectId}`);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className={`create-form-container ${!dataStore.tenantId ? "create-form-container--disabled" : ""}`}>
      <div className="page-header">Create Live Stream</div>
      <form className="form" onSubmit={HandleSubmit}>
        <Radio
          label="Protocol"
          options={[
            {
              optionLabel: "MPEGTS",
              id: "mpegts",
              value: "mpegts",
              checked: basicFormData.protocol === "mpegts",
              onChange: event => UpdateFormData({
                key: "protocol",
                value: event.target.value,
                formKey: FORM_KEYS.BASIC
              })
            },
            {
              optionLabel: "RTMP",
              id: "rtmp",
              value: "rtmp",
              checked: basicFormData.protocol === "rtmp",
              onChange: event => UpdateFormData({
                key: "protocol",
                value: event.target.value,
                formKey: FORM_KEYS.BASIC
              })
            },
            {
              optionLabel: "SRT",
              id: "srt",
              value: "srt",
              checked: basicFormData.protocol === "srt",
              onChange: event => UpdateFormData({
                key: "protocol",
                value: event.target.value,
                formKey: FORM_KEYS.BASIC
              })
            },
            {
              optionLabel: "Custom",
              id: "customProtocol",
              value: "custom",
              checked: basicFormData.protocol === "custom",
              onChange: event => UpdateFormData({
                key: "protocol",
                value: event.target.value,
                formKey: FORM_KEYS.BASIC
              })
            }
          ]}
        />
        {
          basicFormData.protocol === "custom" &&
          <TextInput
            label="URL"
            required={basicFormData.protocol === "custom"}
            value={basicFormData.url}
            disabled={objectData !== null}
            onChange={event => UpdateFormData({
              key: "url",
              value: event.target.value,
              formKey: FORM_KEYS.BASIC
            })}
          />
        }
        {
          basicFormData.protocol !== "custom" &&
          <Select
            label="URL"
            required={true}
            disabled={objectData !== null}
            defaultValue={urls[0]}
            options={urls.map(url => (
              {
                label: url,
                value: url
              }
            ))}
            defaultOption={{
              value: "",
              label: "Select URL"
            }}
            onChange={event => UpdateFormData({
              key: "url",
              value: event.target.value,
              formKey: FORM_KEYS.BASIC
            })}
          />
        }
        <TextInput
          label="Name"
          required={true}
          value={basicFormData.name}
          onChange={event => UpdateFormData({
            key: "name",
            value: event.target.value,
            formKey: FORM_KEYS.BASIC
          })}
        />
        <TextInput
          label="Description"
          value={basicFormData.description}
          onChange={event => UpdateFormData({
            key: "description",
            value: event.target.value,
            formKey: FORM_KEYS.BASIC
          })}
        />
        <TextInput
          label="Display Title"
          value={basicFormData.displayTitle}
          onChange={event => UpdateFormData({
            key: "displayTitle",
            value: event.target.value,
            formKey: FORM_KEYS.BASIC
          })}
        />

        <Select
          label="Access Group"
          disabled={objectData !== null}
          labelDescription="This is the Access Group that will manage your live stream object."
          options={
            Object.keys(dataStore.accessGroups || {}).map(accessGroupName => (
              {
                label: accessGroupName,
                value: accessGroupName
              }
            ))
          }
          defaultOption={{
            value: "",
            label: "Select Access Group"
          }}
          onChange={event => UpdateFormData({
            key: "accessGroup",
            value: event.target.value,
            formKey: FORM_KEYS.BASIC
          })}
        />

        <Permissions
          permission={basicFormData.permission}
          UpdateCallback={(event) => UpdateFormData({
            key: "permission",
            value: event.target.value,
            formKey: FORM_KEYS.BASIC
          })}
        />

        <Select
          label="Library"
          disabled={objectData !== null}
          labelDescription="This is the library where your live stream object will be created."
          required={true}
          options={
            Object.keys(dataStore.libraries || {}).map(libraryId => (
              {
                label: dataStore.libraries[libraryId].name || "",
                value: libraryId
              }
            ))
          }
          defaultOption={{
            value: "",
            label: "Select Library"
          }}
          value={basicFormData.libraryId}
          onChange={event => UpdateFormData({
            key: "libraryId",
            value: event.target.value,
            formKey: FORM_KEYS.BASIC
          })}
        />

        <AdvancedSection
          advancedData={advancedData}
          drmFormData={drmFormData}
          useAdvancedSettings={useAdvancedSettings}
          DrmUpdateCallback={({event, key}) => UpdateFormData({
            key,
            value: event.target.value,
            formKey: FORM_KEYS.DRM
          })}
          AdvancedUpdateCallback={({event, key, value}) => UpdateFormData({
            key,
            value: value ? value : event?.target?.value,
            formKey: FORM_KEYS.ADVANCED
          })}
          AdvancedSettingsCallback={setUseAdvancedSettings}
          objectProbed={objectData !== null}
          audioTracks={audioTracks}
          audioFormData={audioFormData}
          setAudioFormData={setAudioFormData}
          setShowProbeConfirmation={setShowProbeConfirmation}
          objectData={objectData}
          ladderProfilesData={ladderProfilesData}
          playoutProfile={playoutProfile}
          setPlayoutProfile={setPlayoutProfile}
          DisableProbeButton={() => {
            return !(
              basicFormData.url &&
              basicFormData.name &&
              basicFormData.libraryId
            );
          }}
        />

        <div style={{maxWidth: "200px"}}>
          { loading ? <Flex mt={8}><Loader size="md" /></Flex> : null }
        </div>

        <div className="form__actions">
          <input disabled={isCreating} type="submit" value={isCreating ? "Submitting..." : "Save"} />
        </div>
      </form>
      <ProbeConfirmation
        show={showProbeConfirmation}
        url={basicFormData.url}
        CloseCallback={() => setShowProbeConfirmation(false)}
        ConfirmCallback={async () => {
          const {objectId, slug} = await editStore.InitLiveStreamObject({
            basicFormData,
            advancedData,
            drmFormData
          });

          await streamStore.ConfigureStream({objectId, slug});

          setObjectData({objectId, slug});

          notifications.show({
            title: "Probed stream",
            message: "Stream object was successfully created and probed"
          });
        }}
      />
    </div>
  );
});

export default Create;
