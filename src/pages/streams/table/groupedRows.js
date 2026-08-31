// Collapses each group into a single row. A group row sits at the position of its
// *first member in the full (pre-filter) sorted list* - `streamOrder` (objectId ->
// index) - so filtering a group's members never moves the group. Ungrouped streams
// keep their own position. Expanded groups' members follow their row.
export const BuildGroupedRows = ({records, groups, expandedGroups, streamOrder}) => {
  const groupByStreamId = new Map();
  (groups || []).forEach(group => {
    (group.streamIds || []).forEach(id => groupByStreamId.set(id, group));
  });

  if(groupByStreamId.size === 0) { return records; }

  // Stable sort position for any objectId (falls back to records order when the
  // full ordering isn't supplied).
  const recordIndex = new Map(records.map((r, i) => [r.objectId, i]));
  const positionOf = id => streamOrder?.get(id) ?? recordIndex.get(id) ?? Infinity;

  const groupPosition = new Map();
  (groups || []).forEach(group => {
    groupPosition.set(
      group.titleId,
      Math.min(...(group.streamIds || []).map(positionOf), Infinity)
    );
  });

  const membersByTitleId = new Map();
  const ungrouped = [];

  records.forEach(record => {
    const group = groupByStreamId.get(record.objectId);
    if(!group) { ungrouped.push(record); return; }
    const members = membersByTitleId.get(group.titleId) || [];
    members.push(record);
    membersByTitleId.set(group.titleId, members);
  });

  const entities = ungrouped.map(record => ({
    order: positionOf(record.objectId),
    row: record
  }));

  membersByTitleId.forEach((members, titleId) => {
    const group = groupByStreamId.get(members[0].objectId);
    entities.push({
      order: groupPosition.get(titleId) ?? positionOf(members[0].objectId),
      group: true,
      titleId,
      members,
      row: {
        _type: "group",
        objectId: `group-${titleId}`,
        titleId,
        displayTitle: group?.displayTitle ?? members[0]?.display_title,
        streamCount: members.length,
        // Falls back to a member's date until real group data is wired.
        date: group?.data?.date ?? members[0]?.date
      }
    });
  });

  entities.sort((a, b) => a.order - b.order);

  const rows = [];
  entities.forEach(entity => {
    rows.push(entity.row);
    if(entity.group && (expandedGroups || []).includes(entity.titleId)) {
      entity.members.forEach(member => rows.push({...member, _type: "groupChild"}));
    }
  });

  return rows;
};
