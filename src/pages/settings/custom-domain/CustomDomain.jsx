import {Box, Button, Flex, Loader, SimpleGrid, TextInput} from "@mantine/core";
import {useForm} from "@mantine/form";
import {useEffect, useState} from "react";
import {observer} from "mobx-react-lite";
import {notifications} from "@mantine/notifications";
import {dataStore} from "@/stores/index.ts";
import {ValidateUrl} from "@/utils/validators.ts";

const CustomDomain = observer(() => {
  const [saving, setSaving] = useState(false);
  const form = useForm({
    mode: "controlled",
    initialValues: {customDomain: ""},
    validate: {customDomain: value => ValidateUrl({value})}
  });

  useEffect(() => {
    const Load = async() => {
      await dataStore.LoadCustomDomain();
      const values = {customDomain: dataStore.customDomain ?? ""};
      form.setInitialValues(values);
      form.setValues(values);
      form.resetDirty(values);
    };

    Load();
     
  }, []);

  const Save = async() => {
    const {hasErrors} = form.validate();
    if(hasErrors) { return; }

    const values = {customDomain: form.getValues().customDomain.trim()};

    try {
      setSaving(true);
      await dataStore.SaveCustomDomain({customDomain: values.customDomain});
      form.setValues(values);
      form.resetDirty(values);
      notifications.show({title: "Custom domain saved", message: "Custom domain successfully updated"});
    } catch(error) {
      notifications.show({title: "Error", message: "Unable to save custom domain", color: "red"});
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box w="100%" mb={20}>
      <form onSubmit={form.onSubmit(Save)}>
        <Flex justify="flex-end" mb={22}>
          <Button
            type="submit"
            disabled={!form.isDirty() || saving || !dataStore.loadedCustomDomain}
            loading={saving}
          >
            Save
          </Button>
        </Flex>
        <SimpleGrid cols={2} spacing={150}>
          <TextInput
            label="Custom Domain"
            placeholder="https://example.com"
            disabled={!dataStore.loadedCustomDomain}
            rightSection={dataStore.loadedCustomDomain ? null : <Loader size={16} />}
            {...form.getInputProps("customDomain")}
          />
        </SimpleGrid>
      </form>
    </Box>
  );
});

export default CustomDomain;
