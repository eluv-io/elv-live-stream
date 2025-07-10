import {useEffect, useState} from "react";
import {observer} from "mobx-react-lite";
import {Box, Button, Flex, Loader, Modal, Select, Text, TextInput} from "@mantine/core";
import {dataStore} from "@/stores/index.js";

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
  const [loadingLibraries, setLoadingLibraries] = useState(false);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const LoadLibraries = async() => {
      try {
        setLoadingLibraries(true);

        await dataStore.LoadLibraries();

        // Default to title mezzanine library
        const libraryMatchMezz = Object.keys(dataStore.libraries || {}).find(libId => dataStore.libraries[libId].name.toLowerCase().includes("title mezzanines"));

        if(libraryMatchMezz) {
          setLibraryId(libraryMatchMezz);
        }
      } finally {
        setLoadingLibraries(false);
      }
    };

    const LoadGroups = async() => {
      try {
        setLoadingGroups(true);

        await dataStore.LoadAccessGroups();

        // Default to content admin group
        const groupMatchAdmin = Object.keys(dataStore.accessGroups || {})
          .find(groupName => groupName.toLowerCase().includes("content admin"));

        if(groupMatchAdmin) {
          setAccessGroup(groupMatchAdmin);
        }
      } finally {
        setLoadingGroups(false);
      }
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
          (!dataStore.libraries || loadingLibraries) ?
            <Box><Loader /></Box> :
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
          (!dataStore.accessGroups || loadingGroups) ?
            <Box mt={12}><Loader /></Box> :
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
        <Button variant="outline" onClick={close} mr="0.5rem">
          Cancel
        </Button>
        <Button
          disabled={submitting || !libraryId || !title}
          loading={submitting}
          onClick={async () => {
            try {
              setError(undefined);
              setSubmitting(true);
              await Callback(title);
            } catch(error) {
              // eslint-disable-next-line no-console
              console.error(error);
              setError(error?.message || error.kind || error.toString());
            } finally {
              setSubmitting(false);
            }
          }}
        >
          Copy
        </Button>
      </Flex>
    </Modal>
  );
});

export default CopyToVodModal;
