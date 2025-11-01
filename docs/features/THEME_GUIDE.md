# TBD Fantasy Football - Theme System Guide

## Color Palette

```
Primary:     #2D68C4 (Deep Blue)
Secondary:   #26F7FD (Cyan/Light Blue)
Accent:      #FF4B33 (Coral/Red-Orange)
Warning:     #ffb343 (Golden/Orange)
Surface:     #272757 (Dark Purple)
Background:  #1A1A2E (Very Dark Blue-Gray)
```

## Files Created

1. **`lib/theme/app_theme.dart`** - Complete theme configuration
   - `AppColors` class with all color constants
   - `AppTheme` class with Material 3 theme configuration
   - Pre-styled components for buttons, cards, text, etc.

2. **`lib/widgets/common/themed_components.dart`** - Reusable themed widgets
   - `PrimaryButton` - Main CTA button
   - `SecondaryButton` - Secondary/outline button
   - `ThemedBadge` - Status badges/chips
   - `ThemedCard` - Card container with shadow
   - `SectionHeader` - Section titles with accent line
   - `StatBox` - Metric display box
   - `ThemedListItem` - Styled list item

## How to Use

### Colors in Code

```dart
import 'package:app/theme/app_theme.dart';

// Direct color access
Container(
  color: AppColors.primary,  // #2D68C4
  child: Text('Hello', style: TextStyle(color: AppColors.textPrimary)),
)

// Using theme colors
Text(
  'Error Message',
  style: TextStyle(color: Theme.of(context).colorScheme.error),
)
```

### Themed Components

```dart
import 'package:app/widgets/common/themed_components.dart';

// Primary button
PrimaryButton(
  label: 'Draft Now',
  onPressed: () => startDraft(),
  icon: Icons.play_arrow,
)

// Secondary button
SecondaryButton(
  label: 'Cancel',
  onPressed: () => Navigator.pop(context),
)

// Badge for status
ThemedBadge(
  label: 'Active',
  backgroundColor: AppColors.secondary,
  icon: Icons.check_circle,
)

// Card container
ThemedCard(
  padding: EdgeInsets.all(16),
  child: Column(
    children: [...],
  ),
)

// Section header
SectionHeader(
  title: 'Your Leagues',
  subtitle: '3 active leagues',
  accentColor: AppColors.primary,
)

// Stat box for metrics
StatBox(
  label: 'Total Points',
  value: '1,234',
  subValue: '+45.2 this week',
  icon: Icons.trending_up,
  accentColor: AppColors.secondary,
)
```

## Updating Screens

### Before (Hardcoded Colors)
```dart
Container(
  color: Colors.blue,
  child: Text('Title', style: TextStyle(color: Colors.white)),
)
```

### After (Using Theme)
```dart
Container(
  color: AppColors.primary,
  child: Text('Title', style: TextStyle(color: AppColors.textPrimary)),
)
```

## Color Usage Guidelines

| Use Case | Color | Hex Code |
|----------|-------|----------|
| Primary Actions (buttons, links) | Primary | #2D68C4 |
| Highlights & Focus | Secondary | #26F7FD |
| Error States & Alerts | Accent | #FF4B33 |
| Warnings & Important Info | Warning | #ffb343 |
| Card/Modal Backgrounds | Card | #2D2D4A |
| Dark Backgrounds | Background | #1A1A2E |
| Main Text | Text Primary | #FFFFFF |
| Secondary Text | Text Secondary | #B0B0D0 |
| Tertiary Text | Text Tertiary | #808099 |

## Implementation Checklist

Priority screens to update:
- [ ] `draft_room_screen.dart` - Draft experience
- [ ] `league_details_screen.dart` - League info
- [ ] `matchups_screen.dart` - Matchup display
- [ ] `home_screen.dart` - Home/dashboard
- [ ] `available_players_screen.dart` - Player selection
- [ ] Login/Auth screens

## Tips

1. **Always use semantic colors** - Don't hardcode colors directly
2. **Text on colored backgrounds** - Use `AppColors.textPrimary` for white backgrounds, adjust for dark
3. **Accessibility** - Ensure sufficient contrast (WCAG AA minimum 4.5:1 for text)
4. **Gradient overlays** - Use `AppColors.primaryOverlay`, `secondaryOverlay`, etc.
5. **Hover states** - Use `.withValues(alpha: 0.8)` for hover/pressed states

## Customizing Components

All themed components accept color customization:

```dart
ThemedBadge(
  label: 'Custom Color',
  backgroundColor: AppColors.warning,  // Override default
  textColor: AppColors.surface,
)

StatBox(
  label: 'Wins',
  value: '12',
  accentColor: AppColors.accent,  // Custom accent
)
```

## Material 3 Theming

The app uses Material 3 with the custom color scheme. To override specific Material properties:

```dart
Theme.of(context).colorScheme.primary        // #2D68C4
Theme.of(context).colorScheme.secondary      // #26F7FD
Theme.of(context).colorScheme.tertiary       // #ffb343
Theme.of(context).colorScheme.error          // #FF4B33
Theme.of(context).textTheme.headlineMedium   // Pre-styled text
```

## Next Steps

1. Commit and push theme changes
2. Systematically update screens with new components
3. Replace hardcoded colors throughout codebase
4. Test on multiple devices for visual consistency
5. Gather feedback and iterate
