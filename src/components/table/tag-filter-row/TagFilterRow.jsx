import {useRef, useState} from "react";
import {Flex, Pill} from "@mantine/core";
import styles from "./TagFilterRow.module.css";

const TagFilterRow = ({tags=[], selectedTags=[], onTagToggle}) => {
  const scrollRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef({startX: 0, scrollLeft: 0, moved: false});

  if(!tags.length) { return null; }

  const handleMouseDown = (e) => {
    const el = scrollRef.current;
    setDragging(true);
    drag.current = {startX: e.pageX - el.offsetLeft, scrollLeft: el.scrollLeft, moved: false};
  };

  const handleMouseMove = (e) => {
    if(!dragging) { return; }
    const el = scrollRef.current;
    const dx = e.pageX - el.offsetLeft - drag.current.startX;
    if(Math.abs(dx) > 4) { drag.current.moved = true; }
    el.scrollLeft = drag.current.scrollLeft - dx;
  };

  const handleMouseUp = () => setDragging(false);
  const handleMouseLeave = () => setDragging(false);

  return (
    <Flex
      ref={scrollRef}
      gap={8}
      mb={20}
      className={styles.row}
      style={{cursor: dragging ? "grabbing" : undefined}}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
    >
      {tags.map(tag => {
        const selected = selectedTags.includes(tag);
        return (
          <Pill
            key={tag}
            size="md"
            classNames={{
              root: selected ? styles.pillSelected : styles.pill,
              remove: styles.pillRemove
            }}
            onClick={() => {
              if(!drag.current.moved) {
                onTagToggle(tag);
              }
            }}
            withRemoveButton={selected}
            onRemove={() => {
              if(!drag.current.moved) {
                onTagToggle(tag);
              }
            }}
          >
            {tag}
          </Pill>
        );
      })}
    </Flex>
  );
};

export default TagFilterRow;
