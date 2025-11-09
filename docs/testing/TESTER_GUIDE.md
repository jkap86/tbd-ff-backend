# 🏈 HypeTrain Fantasy Football - Tester's Guide

Welcome to HypeTrain! Here's everything you can test in the app.

---

## 🔐 Getting Started

### Create Your Account
1. **Register** with username, email, and password
   - Password needs: uppercase, lowercase, number, 8+ characters
   - Phone number is optional
2. **Login** with your new credentials
3. View your **Profile** anytime from the home screen

---

## 🏆 Leagues

### Create a League
- Set league name and season year
- Choose **Redraft format** (Dynasty/Keeper coming soon)
- Pick team count (4-16 teams)
- Configure scoring rules for passing, receiving, rushing
- Set roster positions (QB, RB, WR, TE, FLEX, K, DEF, IDP)
- Make it public or private
- Sit back and watch the magic happen ✨

### Join a League
Two ways to get in:
1. **Browse public leagues** and join available ones
2. **Accept invitations** from league commissioners

### League Hub
Once you're in a league, you'll see:
- **League Info** - Expandable details about format and settings
- **Standings** - Rankings, wins/losses, points (in-season)
- **Teams** - Click any team to see their roster
- **Chat** - Real-time messaging with leaguemates (swipe up from bottom)
- **Commissioner Controls** (if you created the league)
  - Invite other users
  - Edit settings
  - Delete league

---

## 📋 Drafts

### Start a Draft

**Choose Your Draft Type:**
- **Snake** - Order alternates each round
- **Linear** - Same order every round
- **Auction** - Live bidding (beta)
- **Slow Auction** - 24/7 bidding (beta)

**Pick Your Timer:**
- **Traditional** - Fixed time per pick (10s to 5m)
- **Chess Timer** - Team has total budget that depletes (15m to 6h)

**Advanced Options:**
- 3rd round reversal (snake only)
- Auto-pause overnight (e.g., pause at 11pm, resume at 8am)
- Custom scoring adjustments

### During the Draft

**The Board:**
- See all picks made in real-time
- Current pick timer
- Which team is on the clock

**Player Tab:**
- 🔍 Search for players by name
- 🏷️ Filter by position (QB, RB, WR, TE, K, DEF, IDP)
- 📊 Toggle between 3 stat views:
  - 2025 Projections
  - 2025 Stats
  - 2024 Stats
- 📈 Click any stat to sort by it
- ➕ Add to queue (your watchlist)
- 🎯 Draft button when it's your turn

**Queue Tab:**
- Drag to reorder your queue
- When your pick comes, top player auto-selects
- Manage your strategy

**Chat Tab:**
- Trash talk with your leaguemates in real-time

**Commissioner Controls:**
- Start/pause/resume the draft
- Manage chess timer time (if needed)
- Toggle auto-draft for a team

---

## 🗂️ Your Team

### View Rosters
- Click any team to see their full roster
- See starters and bench players
- Check player stats and injury status

### Edit Your Lineup (In-Season)
- Click your roster
- Tap "Edit" button
- Drag players between starter and bench slots
- Save your changes

---

## ⚡ In-Season Features

### 📊 Matchups
- Select the week you want to view
- See all league matchups for that week
- Watch **live scores update** in real-time as games happen
- Click a matchup for detailed breakdown
- Pull down to refresh scores

### 💱 Trades
- **Propose a trade:**
  - Click the "+" button
  - Pick trading partner
  - Add players going each direction
  - (Optional) Include future draft picks
  - Submit for approval
- **View all trades:**
  - Pending (awaiting response)
  - Completed (finalized)

### 📋 Waivers & Free Agents
- See your remaining FAAB budget
- View free agents available
- Place waiver claims with your bid
- Set claim priority
- Check claim deadline countdown
- See all your submitted claims
- Edit bids before deadline closes

### 🏥 Injury Reports
- Filter by position or NFL team
- See injury status (Out, Questionable, Doubtful, etc.)
- Check expected return dates
- Stay ahead of the game

---

## 💬 Real-Time Features

### League Chat
- Chat with your leaguemates anytime
- Access from league hub (swipe up)
- Also available during drafts
- Messages appear instantly for everyone

### Live Updates
- Scores update as games happen
- Draft picks appear in real-time
- Trade proposals notify immediately
- Waiver deadlines count down live

---

## 🎨 Customize Your Experience

### Light/Dark Mode
- Toggle theme anywhere in the app
- Your preference is saved
- Works on all screens

### Responsive Design
- Works great on phones, tablets, and desktop
- Optimize for your screen size

---

## 🎯 Test These Flows

### Essential (Please Test First!)
✅ Register → Login → View Home
✅ Create a League
✅ Invite Friends to Join
✅ Start a Snake Draft
✅ Pick Players in Draft
✅ Complete Draft Successfully
✅ View Weekly Matchups
✅ See Live Scores Update
✅ Propose a Trade
✅ Submit Waiver Claims

### Important (Definitely Test)
✅ Join a Public League
✅ Accept League Invitation
✅ Edit Your Lineup
✅ View Injury Reports
✅ Send League Chat Messages
✅ View Trade History
✅ Switch Light/Dark Theme
✅ View Any Team's Roster

### Nice to Have (If You Want)
✅ Try Auction Draft (beta)
✅ Use Chess Timer Mode
✅ Enable Auto-Draft
✅ Test on Mobile & Desktop

---

## 🐛 Found an Issue?

If something doesn't work:
1. **Describe what happened** - "I couldn't start a draft because..."
2. **What did you expect?** - "I expected the draft to begin with the first team picking..."
3. **Screenshot if possible** - Really helps!
4. **Let us know your team/league** - Helps us reproduce the issue

---

## 💡 Tips for Best Testing

- **Create multiple accounts** to test invites and trades
- **Draft with a friend** to test real-time features
- **Check at different times** to test live score updates
- **Try on different devices** (phone, tablet, desktop)
- **Test in light AND dark mode** - Visual bugs hide there
- **Use the chat during drafts** to test real-time messaging
