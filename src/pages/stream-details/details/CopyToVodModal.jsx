import {useEffect, useState} from "react";
import {observer} from "mobx-react-lite";
import {Box, Flex, Loader, Modal, Select, Text, TextInput} from "@mantine/core";
import {dataStore} from "@/stores/index.js";
import ElvButton from "@/components/button/ElvButton.jsx";

const CopyToVodModal = observer(({
  show,
  close,
  title,
  setTitle,
  libraryId,
  setLibraryId,
  accessGroup,
  setAccessGroup,
  Callback
}) => {
  const [error, setError] = useState();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const LoadLibraries = async() => {
      await dataStore.LoadLibraries();
    };

    const LoadGroups = async() => {
      await dataStore.LoadAccessGroups();
    };

    if(!dataStore.libraries) {
      LoadLibraries();
    }

    if(!dataStore.accessGroups) {
      LoadGroups();
    }
  }, []);

  return (
    <Modal
      opened={show}
      onClose={close}
      title="Copy to VoD"
      padding="32px"
      radius="6px"
      size="lg"
      centered
    >
      <Box w="100%">
        {
          !dataStore.libraries ?
            <Loader /> :
            (
              <Select
                label="Library"
                required={true}
                data={
                  Object.keys(dataStore.libraries || {}).map(libraryId => (
                    {
                      label: dataStore.libraries[libraryId].name || "",
                      value: libraryId
                    }
                  ))
                }
                placeholder="Select Library"
                value={libraryId}
                onChange={value => setLibraryId(value)}
                mb={16}
              />
            )
        }

        {
          !dataStore.accessGroups ?
            <Loader /> :
            (
              <Select
                label="Access Group"
                description="This is the Access Group that will manage your live stream object."
                data={
                  Object.keys(dataStore.accessGroups || {}).map(accessGroupName => (
                    {
                      label: accessGroupName,
                      value: accessGroupName
                    }
                  ))
                }
                placeholder="Select Access Group"
                value={accessGroup}
                onChange={value => setAccessGroup(value)}
                mb={16}
              />
            )
        }

        <TextInput
          label="Enter a title for the VoD"
          name="title"
          required={true}
          value={title}
          onChange={event => setTitle(event.target.value)}
          style={{width: "100%"}}
        />
        <Text mt={16}>This process takes around 30 seconds per hour of content.</Text>
      </Box>
      {
        !error ? null :
          <div className="modal__error">
            Error: { error }
          </div>
      }
      <Flex direction="row" align="center" mt="1.5rem" justify="flex-end">
        <ElvButton variant="outline" onClick={close} mr="0.5rem">
          Cancel
        </ElvButton>
        <ElvButton
          disabled={loading || !libraryId || !title}
          onClick={async () => {
            try {
              setError(undefined);
              setLoading(true);
              await Callback(title);
            } catch(error) {
              // eslint-disable-next-line no-console
              console.error(error);
              setError(error?.message || error.kind || error.toString());
            } finally {
              setLoading(false);
            }
          }}
        >
          {loading ? <Loader type="dots" size="xs" style={{margin: "0 auto"}} color="white" /> : "Copy"}
        </ElvButton>
      </Flex>
    </Modal>
  );
});

export default CopyToVodModal;
