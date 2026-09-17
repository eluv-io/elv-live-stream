import {useState} from "react";
import {Box, Checkbox, Group, Radio, Stack, Text} from "@mantine/core";
import {DataTable} from "mantine-datatable";
import {IconChevronRight} from "@tabler/icons-react";
import sharedStyles from "@/assets/shared.module.css";

// Used in FMP4/CMAF Packaging and AlternateTranscodeModal. No fabric support
// yet for probe program/PID data - programs stays empty until exposed.
const ProgramPidSelector = ({value, onChange, disabled}) => {
  const programs = value?.programs || [];

  const [localSelections, setLocalSelections] = useState({...(value?.selections || {})});

  if(!programs || programs.length === 0) {
    return (
      <Text fs="italic" fz={14}>Configure the stream to detect programs.</Text>
    );
  }

  const activeProgramId = value?.activeProgramId ?? null;

  const SetActiveProgram = (programId) => {
    const program = programs.find(p => p.id === programId);
    const selected = localSelections[programId] !== undefined ?
      localSelections[programId] :
      (program?.pids || []).map(pid => pid.pid);

    setLocalSelections(prev => ({...prev, [programId]: selected}));
    onChange({
      activeProgramId: programId,
      selections: {[programId]: selected}
    });
  };

  const ToggleInclude = (programId, pid, checked) => {
    const current = localSelections[programId] || [];
    const updated = checked ? [...current, pid] : current.filter(p => p !== pid);

    setLocalSelections(prev => ({...prev, [programId]: updated}));

    if(programId === activeProgramId) {
      onChange({activeProgramId, selections: {[programId]: updated}});
    }
  };

  return (
    <Box style={{border: "1px solid var(--mantine-color-elv-gray-1)", borderRadius: 5}}>
      <Radio.Group value={activeProgramId} onChange={SetActiveProgram}>
        <Stack gap={0}>
          {
            programs.map((program, index) => {
              const isActive = program.id === activeProgramId;
              const included = localSelections[program.id] || [];

              return (
                <Box
                  key={program.id}
                  p={12}
                  style={index < programs.length - 1 ? {borderBottom: "1px solid var(--mantine-color-elv-gray-1)"} : undefined}
                >
                  <Group justify="space-between" wrap="nowrap">
                    <Radio
                      value={program.id}
                      disabled={disabled}
                      label={
                        <Group gap={8} wrap="nowrap">
                          <Text fz="0.875rem" fw={600}>{program.name}</Text>
                          <Text fz="0.75rem" c="elv-gray.6">Program {program.number}</Text>
                        </Group>
                      }
                    />
                    <IconChevronRight
                      size={18}
                      color="var(--mantine-color-elv-gray-5)"
                      style={{transform: isActive ? "rotate(90deg)" : "none", transition: "transform 150ms ease"}}
                    />
                  </Group>
                  {
                    isActive &&
                    <Box mt={12} ml={34}>
                      <Text fz="0.75rem" fw={600} c="elv-gray.6" mb={8}>PIDs in this program</Text>
                      <Box className={sharedStyles.tableWrapper}>
                        <DataTable
                          classNames={{header: sharedStyles.tableHeader}}
                          idAccessor="pid"
                          records={program.pids}
                          withColumnBorders
                          columns={[
                            {accessor: "pid", title: "PID"},
                            {
                              accessor: "type",
                              title: "Type",
                              render: pid => pid.type.charAt(0).toUpperCase() + pid.type.slice(1)
                            },
                            {accessor: "codec", title: "Codec"},
                            {accessor: "description", title: "Description / Name"},
                            {
                              accessor: "include",
                              title: "Include",
                              width: 70,
                              render: pid => (
                                <Checkbox
                                  checked={included.includes(pid.pid)}
                                  disabled={disabled}
                                  onChange={event => ToggleInclude(program.id, pid.pid, event.target.checked)}
                                />
                              )
                            }
                          ]}
                        />
                      </Box>
                    </Box>
                  }
                </Box>
              );
            })
          }
        </Stack>
      </Radio.Group>
    </Box>
  );
};

export default ProgramPidSelector;
