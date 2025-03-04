import {observer} from "mobx-react-lite";
import {ActionIcon, Box, Checkbox, TextInput} from "@mantine/core";
import {DataTable} from "mantine-datatable";
import {AudioBitrateReadable} from "@/utils/helpers.js";
import {AudioCodec} from "@/utils/constants.js";
import {IconCircleCheck, IconCircleCheckFilled} from "@tabler/icons-react";
import styles from "./AudioTracksTable.module.css";
import tableStyles from "../../streams/Streams.module.css";
import {BasicTableRowText} from "@/pages/stream-details/common/DetailsCommon.jsx";


const AudioTracksTable = observer(({
  records,
  audioFormData,
  setAudioFormData,
  disabled
}) => {
  const HandleFormChange = ({index, key, value}) => {
    const audioIndexSpecific = audioFormData[index];
    audioIndexSpecific[key] = value;

    setAudioFormData({
      ...audioFormData,
      [index]: audioIndexSpecific
    });
  };

  const HandleToggleDefault = ({index, value}) => {
    const newData = Object.assign({}, audioFormData);

    if(value === true) {
      // Reset other values
      Object.keys(newData).forEach(key => {
        newData[key] = {
          ...newData[key],
          default: false
        };
      });
    }

    newData[index] = {
      ...newData[index],
      default: value
    };

    setAudioFormData(newData);
  };

  return (
    <Box className={tableStyles.tableWrapper}>
      <DataTable
        classNames={{header: styles.tableHeader}}
        idAccessor="stream_index"
        noRecordsText="No audio tracks found"
        minHeight={records.length > 0 ? 150 : 200}
        fetching={!disabled && !audioFormData}
        records={records}
        withColumnBorders
        groups={[
          {
            id: "input",
            title: "Input",
            style: {fontWeight: 700, fontSize: "14px", lineHeight: "21px", color: "var(--mantine-color-elv-black-3)"},
            columns: [
              {
                accessor: "stream_index",
                title: "Index",
                render: item => (
                  <BasicTableRowText>{ item.stream_index }</BasicTableRowText>
                )
              },
              {
                accessor: "codec_name",
                title: "Codec",
                render: item => (
                  <BasicTableRowText>
                    { AudioCodec(item.codec_name) }</BasicTableRowText>
                )
              },
              {
                accessor: "bit_rate",
                title: "Bitrate",
                render: item => (
                  <BasicTableRowText>{ AudioBitrateReadable(item.bit_rate) }</BasicTableRowText>
                )
              }
            ]
          },
          {
            id: "output",
            title: "Output",
            style: {fontWeight: 700, fontSize: "14px", lineHeight: "21px", color: "var(--mantine-color-elv-black-3)"},
            columns: [
              {
                accessor: "playout_label",
                title: "Label",
                render: item => {
                  return (
                    <TextInput
                      classNames={{input: styles.textInput}}
                      value={audioFormData[item.stream_index].playout_label}
                      disabled={disabled}
                      required={audioFormData[item.stream_index].record}
                      onInvalid={e => e.target.setCustomValidity("Label cannot be empty when enabling Playout")}
                      onInput={e => e.target.setCustomValidity("")}
                      onChange={(event) => {
                        HandleFormChange({
                          index: item.stream_index,
                          key: "playout_label",
                          value: event.target.value
                        });
                      }}
                    />
                  );
                }
              },
              {
                accessor: "language",
                title: "Language",
                render: item => {
                  return (
                    <TextInput
                      classNames={{input: styles.textInput}}
                      value={audioFormData[item.stream_index].lang}
                      disabled={disabled}
                      onChange={(event) => {
                        HandleFormChange({
                          index: item.stream_index,
                          key: "lang",
                          value: event.target.value
                        });
                      }}
                    />
                  );
                }
              },
              {
                accessor: "action_default",
                title: "Default",
                width: 75,
                render: item => (
                  <ActionIcon
                    variant="subtle"
                    color="var(--mantine-color-elv-blue-2)"
                    onClick={() => {
                      HandleToggleDefault({index: item.stream_index, value: !audioFormData[item.stream_index].default});
                    }}
                    disabled={!audioFormData[item.stream_index].record || !audioFormData[item.stream_index].playout || disabled}
                  >
                    {
                      audioFormData[item.stream_index].default ?
                      <IconCircleCheckFilled /> :
                      <IconCircleCheck color="var(--mantine-color-elv-gray-5)" />
                    }
                  </ActionIcon>
                )
              },
              {
                accessor: "action_record",
                title: "Record",
                width: 75,
                render: item => (
                  <Checkbox
                    checked={audioFormData[item.stream_index].record}
                    disabled={disabled}
                    onChange={(event) => {
                      const value = event.target.checked;
                      HandleFormChange({
                        index: item.stream_index,
                        key: "record",
                        value
                      });

                      // Make sure playout is set to false when record is false
                      if(!value) {
                        HandleFormChange({
                          index: item.stream_index,
                          key: "playout",
                          value: false
                        });
                      }
                    }}
                  />
                )
              },
              {
                accessor: "action_playout",
                title: "Playout",
                width: 75,
                render: item => (
                  <Checkbox
                    checked={audioFormData[item.stream_index].playout}
                    onChange={(event) => {
                      HandleFormChange({
                        index: item.stream_index,
                        key: "playout",
                        value: event.target.checked
                      });
                    }}
                    disabled={!audioFormData[item.stream_index].record || disabled}
                  />
                )
              }
            ]
          }
        ]}
      />
    </Box>
  );
});

export default AudioTracksTable;
