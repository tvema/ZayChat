# Closed Messenger (Project Documentation)

## Project Requirements
### 1. Invite System
* Registration is only possible via a unique invite link from an existing user.
* The link is single-use, containing a unique code and the sender's user ID.
* The database strictly records the referral connection (who invited the new user).

### 2. Registration and Profile
* Required fields: Avatar, Nickname, First Name, Last Name, E-mail, Mobile Phone, Password.
* Avatar: Uploading opens an editor with scaling and cropping capabilities. The final image is saved strictly at 256x256 pixels.
* Profile editing (including avatar change) is planned for the future.

### 3. Search and Contacts (Circle)
* Global search: ability to search for other registered users (e.g., by nickname, name, or phone).
* Add to contacts: found users can be added to a personal contact list ("circle") to start messaging.

### 4. Application Interface (Main Screen)
* Left Column (Sidebar):
  * Top: Current user's profile card (avatar, name, access to settings and invite generation).
  * Bottom: List of added contacts ("circle").
* Right Column (Main):
  * Chat window with the selected contact (message history, input field, send button).
  * **Emojis and reactions:** Ability to add emojis (reactions) to specific messages.
  * **Large emojis:** Emojis in the chat body are displayed larger than regular text.
  * **Customization:** Message bubble colors (for the current user and opponent) are extracted to a separate configuration file for easy setup.

## Architecture & Technical Implementation
- **Frontend**: Next.js App Router, Tailwind CSS, Lucide React, Framer Motion
- **Backend**: Express.js (custom server), Socket.IO, SQLite (better-sqlite3)
- **Database**: SQLite (`chat.db`) for storing users, invites, contacts, messages, and reactions.
- **File Storage**: Local filesystem (`public/uploads`) for avatars, WebRTC + IndexedDB for chat files.
- **Client Library**: `react-easy-crop` for photo cropping.

## WebRTC P2P File Transfer Flow
1. Sender selects a file. It is saved to their local `IndexedDB`.
2. Sender sends a JSON metadata message via WebSocket.
3. Receiver gets the message. If the file is not in their `IndexedDB`, they emit `webrtc:request_file` to the sender.
4. Sender receives the request, creates an `RTCPeerConnection`, and opens a `RTCDataChannel`.
5. WebRTC signaling (Offer/Answer/ICE) happens via WebSocket.
6. Once the DataChannel is open, the sender chunks the file (16KB chunks) and sends it, respecting the `bufferedAmount` to prevent overflow.
7. Receiver reassembles the chunks, saves to `IndexedDB`, and displays the file.

## Action Plan
### Stage 1: Infrastructure and Database Preparation
1. Install dependencies: `express`, `socket.io`, `better-sqlite3`, `bcryptjs`, `jsonwebtoken`, `multer`, `react-easy-crop`, `emoji-picker-react`.
2. Setup custom Node.js server (`server.ts`) to run Next.js with WebSockets.
3. Design and initialize SQLite database (tables: `users`, `invites`, `contacts`, `messages`, `reactions`).

### Stage 2: API and Authorization (Backend)
1. Implement invite code generation and validation.
2. Create endpoints for registration (with avatar upload) and login.
3. Setup JWT authorization to protect routes and socket connections.
4. Endpoints for user search and adding to contacts.

### Stage 3: Frontend - Registration and Profile
1. Create Login page.
2. Create Registration page via invite code.
3. Integrate `react-easy-crop` for avatar upload, scaling, and cropping to 256x256.

### Stage 4: Frontend - Main Screen and Chat
1. Create `chat-theme.config.ts` for message bubble color customization.
2. Layout left panel (Sidebar): user profile, invite generation button, contact list.
3. Layout right panel (Chat window): message history, input field.
4. Integrate WebSockets on the client for real-time messaging.

### Stage 5: Chat Features (Emojis and Reactions)
1. Configure message rendering: increase size of single emojis in text.
2. Add UI for selecting and attaching reactions to specific messages.
3. Synchronize reactions via WebSockets.

## Changelog

### v1.2.3 - Message Forwarding & Mobile UX (Current)
* **Message Forwarding:** Implemented the ability to forward messages to any contact or group. Forwarded messages include a "Forwarded" label to distinguish them from original content.
* **Sound Notifications:** Added sound effects for incoming and outgoing messages to improve interaction feedback.
* **Mobile Action Menu:** Improved mobile usability by allowing users to tap on a message bubble to reveal action buttons (React, Forward, Reply), replacing the desktop-centric hover behavior.
* **Forward Modal:** Added a dedicated modal for selecting recipients when forwarding, featuring a real-time search for contacts and groups.
* **Database Schema Update:** Added `forwarded_from` field to the `messages` table to track the original source of forwarded content.

### v1.2.2 - Mobile WebRTC Video Calling Fixes
* **Mobile Browser Compatibility:** Fixed a critical issue where video calls would result in a black screen on mobile browsers (especially Safari on iOS).
* **Native MediaStream Handling:** Switched from manually adding tracks to using the browser's native `event.streams[0]` object, which significantly improves rendering reliability in WebKit-based browsers.
* **Autoplay Policy Bypass:** Implemented a mechanism to unlock video elements during user interaction (calling `play()` on empty streams when "Call" or "Accept" is clicked) to bypass strict mobile autoplay and power-saving policies.
* **Manual Video Override:** Added a manual override feature—tapping anywhere on the screen during an active call forces the video stream to re-attach (`srcObject = null` then reassign), which guarantees a frame re-render if the browser gets stuck.

### v1.2.1
* **Single Active Session:** Implemented a strict "one device per account" policy. Logging into the application from a new device or browser tab now automatically forces a logout on any previously active sessions, preventing WebSocket conflicts and ensuring messages are delivered to the correct active device.
* **WebRTC TURN Server Fallback:** Added configuration for public TURN servers (via OpenRelay/Metered) to the `RTCPeerConnection` setup. This ensures that P2P file transfers succeed even when users are behind strict corporate firewalls or symmetric NATs that block direct connections.
* **File Attachment Thumbnails:** Improved the UI for replying to messages containing files. Instead of a generic "File attachment" text, the reply preview and the quoted message block now display a compact thumbnail of the image (or an icon for other file types) along with the file name.

### v1.2.0
* **Online Status Indicators:** Added real-time online status indicators (green dots and "Online" text) to user avatars in the contact list, search results, chat header, and user profile modal. The status updates instantly via WebSockets when users connect or disconnect.
* **User Profile View:** Added a popup modal with detailed user information (enlarged avatar, name, nickname, email, phone). Opens by clicking the contact's avatar in the top chat bar.
* **Expanded User Data:** Updated backend SQL queries to send `email` and `phone` fields to the client during search and contact loading.
* **Code Refactoring and Optimization:** The main application file (`app/page.tsx`) was divided into logical modules. Separate files were created for types (`types/chat.ts`), utilities (`lib/chatUtils.ts`), and UI components (`FileAttachment`, `InviteModal`, `UserInfoModal`), significantly improving code structure and readability.
* **Theme Customization:** Changed the current user's message color in `chat-theme.config.ts` (from `bg-indigo-600` to `bg-orange-100`).

### v1.1.7 - Chat UI & Routing Fixes
- **Bug Fix**: Fixed an issue where incoming messages from other users would incorrectly appear in the currently active chat window.
- **Feature**: Message timestamps are now displayed inline next to the message content.
- **Bug Fix**: Fixed timezone parsing issues for message timestamps to correctly display local time.

### v1.1.6 - Server Startup Fix
- **Bug Fix**: Fixed a SQL syntax error in `server.ts` that prevented the application from starting.

### v1.1.5 - Read Receipts & Unread Counts
- **Feature**: Added message status indicators (checkmarks) for sent, delivered, and read states.
- **Feature**: Added an unread message count badge to the contact list.

### v1.1.4 - Avatar Cropper Fix
- **Bug Fix**: Restored the avatar cropper dialog (`react-easy-crop`) in the main chat window. Previously, selecting an image would upload it immediately without allowing the user to scale and crop it. Now, selecting an image opens the cropping modal first.

### v1.1.3 - WebRTC DataChannel Async Bug & CSS Fix
- **Bug Fix**: Fixed a critical bug introduced in v1.1.2 where the file transfer would get stuck on "Waiting for peer...". The bug was caused by an asynchronous race condition where the `currentFileId` was reset to `null` by the `end` message before the `saveFile` promise resolved, leading to a silent failure when dispatching the `file-downloaded` event.
- **Bug Fix**: Changed image preview CSS from `object-cover` to `object-contain`. The user's original report of "truncated images" was actually just CSS visually cropping the image to fit the container, not a WebRTC data loss issue.

### v1.1.2 - WebRTC DataChannel Ordering Fix
- **Bug Fix**: Fixed a bug where images/files were sometimes truncated (e.g., the bottom part of an image was missing or gray). This was caused by a known WebRTC issue where string messages (like the `end` signal) can overtake binary chunks on the DataChannel. The receiver now checks `receivedSize >= totalSize` to guarantee all bytes are received before saving the file to IndexedDB, rather than relying on the `end` message.

### v1.1.1 - WebRTC State Guards
- **Bug Fix**: Fixed WebRTC `InvalidStateError` ("Cannot set remote answer in state stable") by adding strict signaling state guards (`pc.signalingState === 'have-local-offer'`) before setting remote answers.
- **Bug Fix**: Added guards to ignore incoming offers if the peer connection is not in a `stable` state to prevent glare crashes.
- **Bug Fix**: Added guard to prevent adding ICE candidates to a `closed` peer connection.

### v1.1.0 - WebRTC Robustness & Error Handling
* **Automatic Invite Copying:** When generating an invite link, it is now automatically copied to the clipboard.
* **Automatic Contact Addition:** When a new user registers via an invite, they automatically appear in the inviter's contact list (circle) in real-time.
* **Avatar Change:** Added the ability to change the avatar by clicking on it in the top left corner (sidebar).
* **Chat Improvement (Emojis):** The emoji button was moved to the left side of the input field for convenience. Added a full Emoji Picker for typing messages.
- **Bug Fix**: Fixed an issue where the WebRTC connection would silently fail and leave the receiver stuck on "Waiting for peer...".
- **Feature**: Added a "Retry" button to the file attachment UI if the WebRTC connection fails.
- **Feature**: Added auto-retry logic when the sender comes back online (`user:online` event).
- **Bug Fix**: Added `try/catch` blocks around `RTCDataChannel.send` to prevent the send queue from getting stuck on errors.
- **Improvement**: Added `dc.bufferedAmountLowThreshold` to properly handle large files without overflowing the DataChannel buffer.
- **Improvement**: Added `onconnectionstatechange` handlers to both sender and receiver to clean up dead connections and dispatch `webrtc-failed` events.
- **Improvement**: Added `user:offline` handler to clean up dead WebRTC connections when a peer disconnects.

### v1.0.1 - WebRTC Race Condition Fixes & Login Update
* **Login by Nickname:** Changed authorization logic. Now, the nickname (username) is used to log in instead of email.
* **Invite Link Generation:** Instead of a simple secret code, a full registration link is now generated (`site_name/register?invite=code`).
* **Invite Code Autofill:** When following an invite link, the code is automatically filled into the registration form.
* **Documentation Merge:** `action_plan.md` and `project_requirements.md` were merged into a single `project_documentation.md` file.
- **Bug Fix**: Fixed WebRTC race conditions where ICE candidates arrived before the remote description was set by queuing them in `pendingCandidates`.
- **Bug Fix**: Fixed DataChannel buffer overflow for large files by checking `dc.bufferedAmount` and waiting for `onbufferedamountlow`.
- **Improvement**: Added a `fileSendQueue` to handle multiple file requests reliably.

### v1.0.0 - Initial Release
- Basic chat functionality with WebSockets.
- P2P File Transfer via WebRTC and IndexedDB.
