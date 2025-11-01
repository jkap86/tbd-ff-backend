# Theme Implementation Guide - Screen by Screen

This guide provides specific strategies for updating each key screen with the new color theme.

## Color Palette Quick Reference

```
Primary Blue:     #2D68C4 → Use for main actions, primary elements
Secondary Cyan:   #26F7FD → Use for highlights, active states, success
Accent Coral:     #FF4B33 → Use for errors, important alerts, danger
Warning Orange:   #ffb343 → Use for warnings, caution, secondary actions
Surface Purple:   #272757 → Use for modals, cards, surfaces
Dark Background:  #1A1A2E → App background
```

## Screen Update Priority

### Tier 1 (Critical - User Entry Points)
1. ✅ **home_screen.dart** - DONE
2. **login_screen.dart** - Auth entry point
3. **register_screen.dart** - Auth entry point
4. **leagues_screen.dart** - Main league list

### Tier 2 (High Impact - Core Functionality)
5. **league_details_screen.dart** - League hub
6. **draft_room_screen.dart** - Primary feature
7. **matchups_screen.dart** - Weekly viewing
8. **available_players_screen.dart** - Player drafting

### Tier 3 (Supporting)
9. **profile_screen.dart** - User settings
10. **waivers/my_claims_screen.dart** - Waiver management
11. Various modals and dialogs

---

## Implementation Pattern

### Step 1: Add Imports
```dart
import '../theme/app_theme.dart';
import '../widgets/common/themed_components.dart';
```

### Step 2: Replace Colors
**Before:**
```dart
Text('Title', style: TextStyle(color: Colors.white))
Container(color: Colors.blue)
Theme.of(context).colorScheme.primary
```

**After:**
```dart
Text('Title', style: const TextStyle(color: AppColors.textPrimary))
Container(color: AppColors.primary)
AppColors.primary
```

### Step 3: Replace Components
**Before:**
```dart
ElevatedButton(
  onPressed: () {},
  child: Text('Submit'),
)

Card(
  child: ListTile(...)
)
```

**After:**
```dart
PrimaryButton(
  label: 'Submit',
  onPressed: () {},
)

ThemedCard(
  child: ThemedListItem(...)
)
```

---

## Screen-Specific Strategies

### Login Screen Strategy
- Use gradient background with Primary + Surface colors
- Make buttons prominent with PrimaryButton/SecondaryButton
- Use textInput with themed decoration (auto-applied via main.dart theme)
- Error messages in Accent color

Key changes:
- Title: Use AppColors.primary
- Subtitle: Use AppColors.secondary
- Error background: Use AppColors.accent.withValues(alpha: 0.1)
- Buttons: Use PrimaryButton and SecondaryButton components

### Leagues Screen Strategy
- Use SectionHeader for section titles
- Replace Card lists with ThemedCard + ThemedListItem combinations
- Badge status indicators with ThemedBadge
- FAB (Floating Action Button) uses Primary color (auto from theme)

Key changes:
- Section titles: SectionHeader widget
- League items: ThemedListItem with league icon/name
- Status badges: ThemedBadge with appropriate colors
- Create button: Standard FAB with AppColors.primary accent

### Draft Room Screen Strategy
- DraftStatusBar already uses custom colors - verify it works with new theme
- Player list items: Use ThemedListItem
- Stats rows: Maintain horizontal scroll but color with AppColors
- Action buttons: Use PrimaryButton/SecondaryButton

Key changes:
- Player cards: ThemedCard background
- Selected player: AppColors.primary highlight
- Bench/inactive: AppColors.textTertiary color
- Action buttons: Primary/Secondary buttons

### League Details Screen Strategy
- Use gradient headers with primary/secondary colors
- Tab indicators: Primary color (auto from theme)
- Cards: ThemedCard for all sections
- Stats display: StatBox components

Key changes:
- Header background: Gradient(primary → surface)
- Section headers: SectionHeader widgets
- Stats: StatBox components
- Tab styling: Already themed via app_theme.dart

### Matchups Screen Strategy
- Matchup cards: ThemedCard with contrasting team colors
- Scores: Use AppColors.secondary for highlights
- Status badges: ThemedBadge with color-coded states
- Team logos: Add colored background with accent colors

Key changes:
- Matchup container: ThemedCard
- Winning team: Highlight with AppColors.secondary
- Losing team: Muted with AppColors.textTertiary
- Projected scores: AppColors.warning
- Final scores: AppColors.primary

### Available Players Screen Strategy
- Search bar: Themed text input (auto-applied)
- Player cards: ThemedCard with position color
- Position badges: ThemedBadge with position-specific colors
- Filter chips: Styled chips (auto-applied via theme)

Key changes:
- Position badges: Color-code each position
  - QB: AppColors.primary
  - RB: AppColors.secondary
  - WR: AppColors.accent
  - TE: AppColors.warning
  - DEF: AppColors.surface
- Selected player: AppColors.secondary highlight
- Projected points: AppColors.warning text color

---

## Color-Coding Patterns

### By Status
- **Active/Good**: AppColors.secondary (Cyan)
- **Pending/Warning**: AppColors.warning (Orange)
- **Error/Bad**: AppColors.accent (Coral)
- **Primary Action**: AppColors.primary (Blue)
- **Secondary Text**: AppColors.textSecondary

### By Position (Draft Screen)
- **QB**: AppColors.primary
- **RB**: AppColors.secondary
- **WR**: AppColors.accent
- **TE**: AppColors.warning
- **DEF**: AppColors.surface
- **Bench**: AppColors.textTertiary

### By League Status
- **Active**: AppColors.primary with AppColors.secondary accent
- **Upcoming**: AppColors.warning
- **Completed**: AppColors.textSecondary
- **Archived**: AppColors.card

---

## Common Replacements

### Text Styling
```dart
// Primary text
TextStyle(color: AppColors.textPrimary, fontSize: 16, fontWeight: FontWeight.bold)

// Secondary text
TextStyle(color: AppColors.textSecondary, fontSize: 14)

// Tertiary/muted text
TextStyle(color: AppColors.textTertiary, fontSize: 12)

// Themed text (use from theme)
Theme.of(context).textTheme.headlineMedium  // Bold title
Theme.of(context).textTheme.bodyMedium      // Regular body text
```

### Button Styling
```dart
// Primary action
PrimaryButton(label: 'Action', onPressed: () {})

// Secondary/cancel
SecondaryButton(label: 'Cancel', onPressed: () {})

// With icon
PrimaryButton(
  label: 'Draft',
  icon: Icons.play_arrow,
  onPressed: () {},
)
```

### Card/Container Styling
```dart
// Simple card
ThemedCard(
  padding: EdgeInsets.all(16),
  child: child,
)

// With gradient
ThemedCard(
  gradient: LinearGradient(
    colors: [AppColors.primary, AppColors.surface],
  ),
  child: child,
)

// With tap action
ThemedCard(
  onTap: () {},
  child: child,
)
```

### Badge/Status Styling
```dart
// Status badge
ThemedBadge(
  label: 'Active',
  backgroundColor: AppColors.secondary,
  icon: Icons.check_circle,
)

// Warning badge
ThemedBadge(
  label: 'Pending',
  backgroundColor: AppColors.warning,
  icon: Icons.schedule,
)
```

---

## Testing Checklist

After updating each screen:
- [ ] Colors match palette (use color picker to verify hex codes)
- [ ] Text is readable on all backgrounds (check contrast)
- [ ] Buttons are clearly interactive (hover/press states)
- [ ] Icons use appropriate accent colors
- [ ] Cards have proper shadow/depth
- [ ] Status indicators are color-coded consistently
- [ ] Loading states use theme colors
- [ ] Error messages use Accent color
- [ ] Success states use Secondary color
- [ ] Disabled states use TextTertiary color

---

## Batch Update Efficiency Tips

1. **Use Find and Replace**
   - Find: `Colors.blue` → Replace with: `AppColors.primary`
   - Find: `Colors.white` → Replace with: `AppColors.textPrimary`
   - Find: `Colors.grey` → Replace with: `AppColors.textSecondary`
   - Find: `Theme.of(context).colorScheme.primary` → Replace with: `AppColors.primary`

2. **Group Similar Changes**
   - Update all button colors together
   - Update all text colors together
   - Update all card/background colors together

3. **Verify After Each Change**
   - Run `flutter analyze` after each screen
   - Check for compile errors
   - Verify visual appearance

4. **Extract Common Patterns**
   - If you repeat a color combination, create a helper widget
   - Example: A "league card" template that handles styling

---

## Quick Visual Audit

Run the app after each screen update and verify:

| Element | Visual Check |
|---------|--------------|
| **AppBar** | Dark purple background, white text |
| **Body** | Dark blue-gray background |
| **Cards** | Dark purple cards with subtle shadow |
| **Primary Buttons** | Bright blue (#2D68C4) |
| **Text** | White/light gray text readable on dark bg |
| **Icons** | Colored per context (primary/secondary/accent) |
| **Status Badges** | Bright cyan for good, orange for warning, coral for error |

---

## Post-Update Workflow

1. Update screen code
2. Run `flutter analyze` - verify no errors
3. Run app on device/emulator - visual check
4. Commit with descriptive message:
   ```
   Update [screen_name] with new theme system

   - Use AppColors constants
   - Replace Card with ThemedCard
   - Apply color-coded icons
   - Use themed button components
   ```
5. Test key functionality on updated screen
6. Move to next screen

---

## Support Reference

**AppTheme file**: `lib/theme/app_theme.dart`
- AppColors: All color constants
- AppTheme: Material 3 configuration
- Component styling presets

**Components file**: `lib/widgets/common/themed_components.dart`
- PrimaryButton, SecondaryButton
- ThemedBadge, ThemedCard
- SectionHeader, StatBox, ThemedListItem

**Main theme**: `lib/main.dart`
- Global theme application
- Sets Material3 theme for entire app
