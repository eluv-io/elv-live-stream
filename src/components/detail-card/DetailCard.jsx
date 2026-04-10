import {Box, Divider, Group, Text} from "@mantine/core";

const DetailCard = ({
  title,
  titleRightSection,
  details=[]
}) => {
  return (
    <Box>
      <Group>
        <Text>{ title }</Text>
        {
          titleRightSection ? titleRightSection : null
        }
      </Group>
      <Divider />

      {
        details.map((detail, i) => (
          <Group key={`detail-${title}-${i}-${detail.key}`}>
            <Text>{ detail.key }</Text>
            {
              typeof detail.value === "string" ?
                <Text>{ detail.value }</Text> :
                detail.value
            }
          </Group>
        ))
      }
    </Box>
  );
};

export default DetailCard;
