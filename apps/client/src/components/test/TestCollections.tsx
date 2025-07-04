// Test script to verify the collections merge functionality
import { collections as hardcodedCollections } from "../../utils/themes";
import { useCollections } from "../../hooks/useCollections";

console.log("Hardcoded Collections:", hardcodedCollections.length);
console.log(
  "Collections structure:",
  hardcodedCollections.map(c => ({ id: c.id, name: c.name, themeCount: c.themeCount }))
);

// This would be used in a React component:
// const { collections, isLoading, serverCollections } = useCollections();

export default function TestCollections() {
  return null;
}
