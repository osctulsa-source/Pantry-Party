import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";

const mockGoBack = jest.fn();
const mockAdd = jest.fn().mockResolvedValue("demo-item");
const mockRead = jest.fn();

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ goBack: mockGoBack, setParams: jest.fn() }),
  useRoute: () => ({ params: {} }),
}));
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView:
    jest.requireActual<typeof import("react-native")>("react-native").View,
}));
jest.mock("lucide-react-native", () => ({
  Check: () => null,
  Image: () => null,
}));
jest.mock("../../components/BrandDecor", () => ({ BrandLoader: () => null }));
jest.mock("../household/ActiveHouseholdContext", () => ({
  useActiveHousehold: () => ({ activeHouseholdId: "demo-household" }),
}));
jest.mock("../auth/AuthContext", () => ({
  useAuth: () => ({
    state: { status: "authenticated", session: { user: { id: "demo-user" } } },
  }),
}));
jest.mock("../pantry/addPantryItem", () => ({
  addOrMergePantryItem: (...args: unknown[]) => mockAdd(...args),
}));
jest.mock("../../observability/analytics", () => ({ track: jest.fn() }));
jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  NotificationFeedbackType: { Success: "success", Error: "error" },
}));
jest.mock("./pickReceiptImage", () => ({
  pickReceiptImage: jest.fn().mockResolvedValue("file://synthetic-order.png"),
  PhotoLibraryDeniedError: class extends Error {},
}));
jest.mock("./runTextOcr", () => ({
  readImageText: (...args: unknown[]) => mockRead(...args),
  TextOcrEmptyError: class extends Error {},
  TextOcrUnavailableError: class extends Error {},
}));

import { BulkPasteScreen } from "./BulkPasteScreen";

describe("capture review before local pantry writes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAdd.mockResolvedValue("demo-item");
    mockRead.mockResolvedValue({ text: "Milk\nEggs\nSpinach", textChars: 17 });
  });

  it("saves corrected, selected items from an image only after explicit review", async () => {
    render(<BulkPasteScreen />);
    fireEvent.press(
      screen.getByLabelText("Read a receipt or grocery-order screenshot"),
    );
    await waitFor(() =>
      expect(screen.getByDisplayValue("Milk\nEggs\nSpinach")).toBeTruthy(),
    );
    expect(mockRead).toHaveBeenCalledWith("file://synthetic-order.png");
    expect(mockAdd).not.toHaveBeenCalled();

    // Use the real grocery parser after correcting the captured text.
    fireEvent.changeText(
      screen.getByLabelText("Grocery list to review"),
      "Oat milk\nEggs\nSpinach",
    );
    fireEvent.press(screen.getByLabelText("Eggs, 1"));
    fireEvent.press(screen.getByLabelText("Add 2 items to pantry"));

    await waitFor(() => expect(mockGoBack).toHaveBeenCalledTimes(1));
    expect(mockAdd).toHaveBeenCalledTimes(2);
    expect(mockAdd.mock.calls.map(([item]) => item.name)).toEqual([
      "Oat milk",
      "Spinach",
    ]);
    for (const [item] of mockAdd.mock.calls) {
      expect(item).toMatchObject({
        householdId: "demo-household",
        userId: "demo-user",
        source: "receipt",
        quantity: 1,
      });
    }
  });

  it("keeps the review open and reports a local write failure", async () => {
    mockAdd.mockRejectedValueOnce(new Error("Local storage is full"));
    render(<BulkPasteScreen />);
    fireEvent.changeText(
      screen.getByLabelText("Grocery list to review"),
      "Milk",
    );
    fireEvent.press(screen.getByLabelText("Add 1 items to pantry"));
    await waitFor(() =>
      expect(screen.getByText("Local storage is full")).toBeTruthy(),
    );
    expect(mockGoBack).not.toHaveBeenCalled();
  });

  it("does not write anything when every candidate is excluded", () => {
    render(<BulkPasteScreen />);
    fireEvent.changeText(
      screen.getByLabelText("Grocery list to review"),
      "Milk",
    );
    fireEvent.press(screen.getByLabelText("Milk, 1"));
    fireEvent.press(screen.getByLabelText("Add 0 items to pantry"));
    expect(mockAdd).not.toHaveBeenCalled();
    expect(mockGoBack).not.toHaveBeenCalled();
  });
});
