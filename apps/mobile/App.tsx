/**
 * Entry point — placeholder. The walking skeleton (Phase 1) replaces this with the
 * sync provider + navigation. For now it just proves the theme token layer wires up.
 */
import { Text, View } from "react-native";
import { tokens } from "./src/theme/tokens";

export default function App() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: tokens.color.surface }}>
      <Text style={{ color: tokens.color.accent, fontSize: 24, fontWeight: "700" }}>
        {tokens.brandName}
      </Text>
      <Text style={{ color: tokens.color.inkMuted, marginTop: tokens.space(2) }}>
        Phase 1 walking skeleton goes here.
      </Text>
    </View>
  );
}
