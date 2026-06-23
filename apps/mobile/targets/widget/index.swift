//
//  index.swift — Pantry Party "Expiring Soon" widget (WidgetKit + SwiftUI).
//
//  A widget process can't run JS or talk to PowerSync, so it renders a small
//  snapshot the RN app writes into the shared App Group on every pantry change
//  (see src/features/widget/useExpiringWidget.ts + expiringSnapshot.ts).
//
//  Contract with the JS side:
//    • App Group:  group.com.osctulsa.pantryparty   (fixed — no .dev suffix)
//    • Key:        "expiring"
//    • Value:      a JSON *string* matching ExpiringSnapshot below.
//
//  Families: lock-screen accessories (inline / circular / rectangular, iOS 16+)
//  plus home-screen systemSmall / systemMedium.
//
//  NOTE: agent-authored and NOT yet compiled on a Mac. Expect to verify on
//  device and tweak SwiftUI nits. The data contract (keys + field names) is the
//  part that must stay in lockstep with the TS.
//

import WidgetKit
import SwiftUI
import UIKit

// MARK: - Shared App Group contract

private let appGroup = "group.com.osctulsa.pantryparty"
private let snapshotKey = "expiring"

/// Mirrors `ExpiringSnapshot` in src/features/widget/expiringSnapshot.ts.
struct ExpiringSnapshot: Codable {
  var count: Int
  var soonestName: String?
  var soonestLabel: String?
  var updatedAt: Double

  static let empty = ExpiringSnapshot(count: 0, soonestName: nil, soonestLabel: nil, updatedAt: 0)
  static let sample = ExpiringSnapshot(count: 3, soonestName: "Spinach", soonestLabel: "tomorrow", updatedAt: 0)
}

/// Read + decode the latest snapshot the app wrote. Any miss → `.empty`.
private func loadSnapshot() -> ExpiringSnapshot {
  guard
    let defaults = UserDefaults(suiteName: appGroup),
    let raw = defaults.string(forKey: snapshotKey),
    let data = raw.data(using: .utf8),
    let decoded = try? JSONDecoder().decode(ExpiringSnapshot.self, from: data)
  else {
    return .empty
  }
  return decoded
}

// MARK: - Timeline

struct PantryEntry: TimelineEntry {
  let date: Date
  let snapshot: ExpiringSnapshot
}

struct Provider: TimelineProvider {
  func placeholder(in context: Context) -> PantryEntry {
    PantryEntry(date: Date(), snapshot: .sample)
  }

  func getSnapshot(in context: Context, completion: @escaping (PantryEntry) -> Void) {
    let snapshot = context.isPreview ? .sample : loadSnapshot()
    completion(PantryEntry(date: Date(), snapshot: snapshot))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<PantryEntry>) -> Void) {
    let entry = PantryEntry(date: Date(), snapshot: loadSnapshot())
    // The app reloads timelines on every write; this hourly refresh is just a
    // fallback so relative labels don't drift if the app hasn't run in a while.
    let next = Calendar.current.date(byAdding: .hour, value: 1, to: Date()) ?? Date().addingTimeInterval(3600)
    completion(Timeline(entries: [entry], policy: .after(next)))
  }
}

// MARK: - Crumb palette (hardcoded; light/dark aware for home families)

extension Color {
  static let crumbAccent = Color(red: 46 / 255, green: 93 / 255, blue: 58 / 255)      // #2E5D3A
  static let crumbSurface = Color(uiColor: UIColor { trait in
    trait.userInterfaceStyle == .dark
      ? UIColor(red: 24 / 255, green: 20 / 255, blue: 14 / 255, alpha: 1)              // #18140E
      : UIColor(red: 246 / 255, green: 242 / 255, blue: 233 / 255, alpha: 1)          // #F6F2E9
  })
  static let crumbInk = Color(uiColor: UIColor { trait in
    trait.userInterfaceStyle == .dark
      ? UIColor(red: 243 / 255, green: 238 / 255, blue: 227 / 255, alpha: 1)          // #F3EEE3
      : UIColor(red: 35 / 255, green: 33 / 255, blue: 27 / 255, alpha: 1)             // #23211B
  })
  static let crumbInkMuted = Color(uiColor: UIColor { trait in
    trait.userInterfaceStyle == .dark
      ? UIColor(white: 0.72, alpha: 1)
      : UIColor(white: 0.42, alpha: 1)
  })
}

extension View {
  /// iOS 17 requires a declared widget container background; iOS 16 uses a
  /// plain background. One helper hides the availability split.
  @ViewBuilder
  func widgetContainerBackground(_ color: Color) -> some View {
    if #available(iOS 17.0, *) {
      self.containerBackground(color, for: .widget)
    } else {
      self.background(color)
    }
  }
}

// MARK: - Views

struct PantryWidgetEntryView: View {
  @Environment(\.widgetFamily) private var family
  var entry: Provider.Entry

  var body: some View {
    switch family {
    case .accessoryInline:
      InlineView(snapshot: entry.snapshot)
    case .accessoryCircular:
      CircularView(snapshot: entry.snapshot)
    case .accessoryRectangular:
      RectangularView(snapshot: entry.snapshot)
    default:
      HomeView(snapshot: entry.snapshot)
    }
  }
}

/// Lock-screen inline: one tinted line above the clock.
struct InlineView: View {
  let snapshot: ExpiringSnapshot

  var body: some View {
    if snapshot.count == 0 {
      Label("Pantry fresh", systemImage: "checkmark.circle")
    } else if let name = snapshot.soonestName, let label = snapshot.soonestLabel {
      Label("\(name) \(label)", systemImage: "clock")
    } else {
      Label("\(snapshot.count) expiring", systemImage: "clock")
    }
  }
}

/// Lock-screen circular: the count, or a checkmark when all fresh.
struct CircularView: View {
  let snapshot: ExpiringSnapshot

  var body: some View {
    ZStack {
      AccessoryWidgetBackground()
      if snapshot.count == 0 {
        Image(systemName: "checkmark")
          .font(.system(size: 22, weight: .semibold))
      } else {
        VStack(spacing: -1) {
          Text("\(snapshot.count)")
            .font(.system(size: 24, weight: .bold, design: .rounded))
          Text(snapshot.count == 1 ? "item" : "items")
            .font(.system(size: 9))
        }
      }
    }
    .widgetContainerBackground(.clear)
  }
}

/// Lock-screen rectangular: a short two-line summary.
struct RectangularView: View {
  let snapshot: ExpiringSnapshot

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      if snapshot.count == 0 {
        Label("Pantry fresh", systemImage: "checkmark.circle.fill")
          .font(.headline)
        Text("Nothing expiring soon")
          .font(.caption)
      } else {
        Label("\(snapshot.count) expiring soon", systemImage: "clock.fill")
          .font(.headline)
        if let name = snapshot.soonestName, let label = snapshot.soonestLabel {
          Text("\(name) — \(label)")
            .font(.caption)
            .lineLimit(1)
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .widgetContainerBackground(.clear)
  }
}

/// Home-screen small/medium: branded crumb-palette card.
struct HomeView: View {
  let snapshot: ExpiringSnapshot

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      HStack(spacing: 5) {
        Image(systemName: "leaf.fill")
          .font(.system(size: 13))
          .foregroundColor(.crumbAccent)
        Text("Pantry Party")
          .font(.system(size: 13, weight: .semibold))
          .foregroundColor(.crumbInk)
      }

      Spacer(minLength: 0)

      if snapshot.count == 0 {
        Text("All fresh")
          .font(.system(size: 26, weight: .bold, design: .rounded))
          .foregroundColor(.crumbInk)
        Text("Nothing expiring soon")
          .font(.system(size: 12))
          .foregroundColor(.crumbInkMuted)
      } else {
        HStack(alignment: .firstTextBaseline, spacing: 5) {
          Text("\(snapshot.count)")
            .font(.system(size: 40, weight: .bold, design: .rounded))
            .foregroundColor(.crumbAccent)
          Text(snapshot.count == 1 ? "item\nexpiring soon" : "items\nexpiring soon")
            .font(.system(size: 12, weight: .medium))
            .foregroundColor(.crumbInkMuted)
        }
        if let name = snapshot.soonestName, let label = snapshot.soonestLabel {
          Text("\(name) · \(label)")
            .font(.system(size: 13, weight: .medium))
            .foregroundColor(.crumbInk)
            .lineLimit(1)
        }
      }

      Spacer(minLength: 0)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    .padding(16)
    .widgetContainerBackground(.crumbSurface)
  }
}

// MARK: - Widget + bundle

struct PantryWidget: Widget {
  let kind = "PantryExpiringWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: Provider()) { entry in
      PantryWidgetEntryView(entry: entry)
    }
    .configurationDisplayName("Expiring Soon")
    .description("See what's about to expire in your pantry.")
    .supportedFamilies([
      .accessoryInline,
      .accessoryCircular,
      .accessoryRectangular,
      .systemSmall,
      .systemMedium,
    ])
  }
}

@main
struct PantryWidgetBundle: WidgetBundle {
  var body: some Widget {
    PantryWidget()
  }
}
