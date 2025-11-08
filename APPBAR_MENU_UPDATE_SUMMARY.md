# AppBar Menu Standardization - Update Summary

## Overview
Updating all screens in `flutter_app/lib/screens/` to have a consistent AppBar menu pattern with:
- Icons.menu (hamburger icon) for all PopupMenuButtons
- Theme toggle icon (dynamic: light_mode/dark_mode)
- Profile icon (person)
- NO text labels, icons only
- These two items at the END of each menu

## Completed Updates (5 screens)

### 1. home_screen.dart ✅
- **Status**: Updated
- **Changes**:
  - Changed from 'toggle_theme' to 'theme_toggle' for consistency
  - Removed text labels from menu items
  - Changed context.go to context.push for profile navigation
  - Already had Icons.menu

### 2. leagues_screen.dart ✅
- **Status**: Updated
- **Changes**:
  - Changed from Icons.more_vert to Icons.menu
  - Added ThemeProvider Consumer wrapper
  - Removed all text labels from menu items (including existing 'Join League')
  - Added theme toggle and profile items at the end
  - Changed context.go to context.push for profile

### 3. profile_screen.dart ✅
- **Status**: Updated
- **Changes**:
  - Added ThemeProvider import
  - Created new menu with theme toggle and profile items
  - Used Icons.menu

### 4. league_details_screen.dart ✅
- **Status**: Updated
- **Changes**:
  - Changed from Consumer2 to Consumer3 to include ThemeProvider
  - Removed text labels from existing 'Invite Members' menu item
  - Added theme toggle and profile items at the end
  - Added fallback menu for non-commissioners with just theme toggle and profile
  - Already had Icons.menu

### 5. roster_details_screen.dart ✅
- **Status**: Updated
- **Changes**:
  - Added ThemeProvider import
  - Added menu that only shows when NOT in edit mode
  - Removed text labels
  - Added theme toggle and profile items

## Remaining Updates (18 screens)

### Screens with Existing PopupMenuButton (5 files) - Need to update existing menus
1. **draft_room_screen.dart** - Complex draft interface
2. **injury_report_screen.dart** - Existing menu needs updating
3. **matchup_detail_screen.dart** - Existing menu needs updating
4. **my_claims_screen.dart** - Waiver claims screen
5. **weekly_lineup_screen.dart** - Lineup management screen

### Screens WITHOUT PopupMenuButton (13 files) - Need to add new menus
1. **auction_draft_screen.dart**
2. **available_players_screen.dart**
3. **create_league_screen.dart**
4. **draft_derby_screen.dart**
5. **draft_setup_screen.dart**
6. **edit_league_screen.dart**
7. **invite_members_screen.dart**
8. **join_league_screen.dart**
9. **matchups_screen.dart**
10. **propose_trade_screen.dart**
11. **slow_auction_draft_screen.dart**
12. **trades_screen.dart**
13. **waivers_hub_screen.dart**

## Screens Skipped (6 files)
- login_screen.dart - Auth screen
- register_screen.dart - Auth screen
- forgot_password_screen.dart - Auth screen
- reset_password_screen.dart - Auth screen
- auth_wrapper.dart - Auth wrapper
- card_variants_demo_screen.dart - Demo screen

## Standard Menu Pattern

### For screens with existing menu items:
```dart
actions: [
  Consumer<ThemeProvider>(
    builder: (context, themeProvider, _) {
      return PopupMenuButton<String>(
        icon: const Icon(Icons.menu),
        tooltip: 'Menu',
        onSelected: (value) async {
          if (value == 'existing_action') {
            // existing action code
          } else if (value == 'theme_toggle') {
            themeProvider.toggleTheme();
          } else if (value == 'profile') {
            context.push('/profile');
          }
        },
        itemBuilder: (BuildContext context) => [
          const PopupMenuItem<String>(
            value: 'existing_action',
            child: Icon(Icons.existing_icon),
          ),
          // ... other existing items ...
          PopupMenuItem<String>(
            value: 'theme_toggle',
            child: Icon(
              themeProvider.isDarkMode
                  ? Icons.light_mode
                  : Icons.dark_mode,
            ),
          ),
          const PopupMenuItem<String>(
            value: 'profile',
            child: Icon(Icons.person),
          ),
        ],
      );
    },
  ),
],
```

### For screens without existing menus:
```dart
actions: [
  Consumer<ThemeProvider>(
    builder: (context, themeProvider, _) {
      return PopupMenuButton<String>(
        icon: const Icon(Icons.menu),
        tooltip: 'Menu',
        onSelected: (value) async {
          if (value == 'theme_toggle') {
            themeProvider.toggleTheme();
          } else if (value == 'profile') {
            context.push('/profile');
          }
        },
        itemBuilder: (BuildContext context) => [
          PopupMenuItem<String>(
            value: 'theme_toggle',
            child: Icon(
              themeProvider.isDarkMode
                  ? Icons.light_mode
                  : Icons.dark_mode,
            ),
          ),
          const PopupMenuItem<String>(
            value: 'profile',
            child: Icon(Icons.person),
          ),
        ],
      );
    },
  ),
],
```

## Required Import
All screens need this import if not already present:
```dart
import '../providers/theme_provider.dart';
```

## Next Steps
1. Continue updating the 5 screens with existing PopupMenuButtons
2. Add menus to the 13 screens without them
3. Test all screens to ensure proper functionality
4. Commit changes to the dev branch
