import 'package:flutter/material.dart';

/// teledrive Android default light palette extracted from ThemeColors.java.
///
/// Main source:
/// org.teledrive.ui.ActionBar.ThemeColors#createDefaultColors()
class AppColors {
  AppColors._();

  // ---------------------------------------------------------------------------
  // Core teledrive colors
  // ---------------------------------------------------------------------------

  /// Refined monochrome primary for light mode (Obsidian Black)
  static const Color teledriveBlue = Color(0xFF141619);

  /// Refined monochrome text primary
  static const Color teledriveBlueText = Color(0xFF141619);

  /// ThemeColors.DEFAULT_BLACK_TEXT = 0xFF141619
  static const Color defaultBlackText = Color(0xFF141619);

  static const Color onPrimary = Color(0xFFFFFFFF);

  // ---------------------------------------------------------------------------
  // Light theme surfaces
  // ---------------------------------------------------------------------------

  static const Color lightBg = Color(0xFFFFFFFF);
  static const Color lightSurface = Color(0xFFF7F8FA);
  static const Color lightSurfaceAlt = Color(0xFFEFF1F4);
  static const Color lightSurfaceElevated = Color(0xFFFFFFFF);
  static const Color lightDivider = Color(0xFFE5E7EC);

  static const Color lightTextPrimary = defaultBlackText;
  static const Color lightTextSecondary = Color(0xFF6B7280);
  static const Color lightTextSecondary2 = Color(0xFF646B75);
  static const Color lightTextHint = Color(0xFF9CA3AF);
  static const Color lightLinkText = Color(0xFF25282D);

  // ---------------------------------------------------------------------------
  // Dialog / modal colors
  // ---------------------------------------------------------------------------

  static const Color dialogBackground = Color(0xFFFFFFFF);
  static const Color dialogBackgroundGray = Color(0xFFF0F0F0);
  static const Color dialogTextBlack = defaultBlackText;
  static const Color dialogTextLink = Color(0xFF2678B6);
  static const Color dialogTextBlue = Color(0xFF2F8CC9);
  static const Color dialogTextBlue2 = Color(0xFF3A95D5);
  static const Color dialogTextBlue4 = Color(0xFF19A7E8);
  static const Color dialogTextGray = Color(0xFF348BC1);
  static const Color dialogTextGray2 = Color(0xFF757575);
  static const Color dialogTextGray3 = Color(0xFF999999);
  static const Color dialogTextGray4 = Color(0xFFB3B3B3);
  static const Color dialogTextHint = Color(0xFF979797);
  static const Color dialogIcon = defaultBlackText;
  static const Color dialogGrayLine = Color(0xFFD2D2D2);
  static const Color dialogButton = teledriveBlueText;
  static const Color dialogButtonSelector = Color(0x0F000000);

  // ---------------------------------------------------------------------------
  // Action bar
  // ---------------------------------------------------------------------------

  static const Color actionBarDefault = Color(0xFFFFFFFF);
  static const Color actionBarDefaultIcon = defaultBlackText;
  static const Color actionBarDefaultTitle = defaultBlackText;
  static const Color actionBarDefaultSubtitle = Color(0xFF79817E);
  static const Color actionBarDefaultSelector = Color(0x121A1D21);
  static const Color actionBarTabActiveText = teledriveBlueText;
  static const Color actionBarTabInactiveText = Color(0xFF777C7F);
  static const Color actionBarTabLine = teledriveBlueText;

  // ---------------------------------------------------------------------------
  // Chat list
  // ---------------------------------------------------------------------------

  static const Color chatsName = Color(0xFF1A1D21);
  static const Color chatsMessage = Color(0xFF75787A);
  static const Color chatsMessageThreeLines = Color(0xFF8E9091);
  static const Color chatsDate = Color(0xFF848688);
  static const Color chatsDateBold = Color(0xFF919395);
  static const Color chatsNameMessage = teledriveBlueText;
  static const Color chatsDraft = Color(0xFFDD4B39);
  static const Color chatsUnreadCounter = teledriveBlue;
  static const Color chatsUnreadCounterMuted = Color(0xFFBEC3C7);
  static const Color chatsUnreadCounterText = Color(0xFFFFFFFF);
  static const Color chatsOnlineCircle = Color(0xFF4BCB1C);
  static const Color chatsMuteIcon = Color(0xFFBDC1C4);
  static const Color chatsPinnedIcon = Color(0xFF919294);
  static const Color chatsVerifiedBackground = Color(0xFF33A8E6);
  static const Color chatsVerifiedCheck = Color(0xFFFFFFFF);

  // ---------------------------------------------------------------------------
  // Chat screen
  // ---------------------------------------------------------------------------

  static const Color chatStatus = teledriveBlueText;

  static const Color chatInBubble = Color(0xFFFFFFFF);
  static const Color chatInBubbleSelected = Color(0xFFECF7FD);
  static const Color chatInBubbleShadow = Color(0xFF1D3753);

  static const Color chatOutBubble = Color(0xFFEFFFDE);
  static const Color chatOutBubbleSelected = Color(0xFFD9F7C5);
  static const Color chatOutBubbleShadow = Color(0xFF1E750C);

  static const Color chatMessageTextIn = Color(0xFF000000);
  static const Color chatMessageTextOut = Color(0xFF000000);
  static const Color chatMessageLinkIn = Color(0xFF2678B6);
  static const Color chatMessageLinkOut = Color(0xFF2678B6);

  static const Color chatInTimeText = Color(0xFFA1AAB3);
  static const Color chatOutTimeText = Color(0xFF70B15C);

  static const Color chatOutSentCheck = Color(0xFF5DB050);
  static const Color chatOutSentClock = Color(0xFF75BD5E);
  static const Color chatInSentClock = Color(0xFFA1AAB3);

  static const Color chatSelectedBackground = Color(0x280A90F0);
  static const Color chatLinkSelectBackground = Color(0x3362A9E3);
  static const Color chatTextSelectBackground = Color(0x6662A9E3);

  static const Color chatMessagePanelBackground = Color(0xFFFFFFFF);
  static const Color chatMessagePanelText = Color(0xFF000000);
  static const Color chatMessagePanelHint = Color(0xFF858A84);
  static const Color chatMessagePanelCursor = Color(0xFF54A1DB);
  static const Color chatMessagePanelIcons = Color(0xFF8E959B);
  static const Color chatMessagePanelSend = teledriveBlue;

  static const Color chatReplyPanelIcons = Color(0xFF57A8E6);
  static const Color chatReplyPanelClose = Color(0xFF8E959B);
  static const Color chatReplyPanelName = teledriveBlueText;
  static const Color chatReplyPanelLine = Color(0xFFE8E8E8);

  static const Color chatEmojiPanelBackground = Color(0xFFF0F2F5);
  static const Color chatEmojiSearchBackground = Color(0xFFE5E9EE);
  static const Color chatEmojiSearchIcon = Color(0xFF94A1AF);
  static const Color chatEmojiPanelIcon = Color(0xFF9DA4AB);
  static const Color chatEmojiPanelIconSelected = Color(0xFF5E6976);

  // ---------------------------------------------------------------------------
  // Avatars
  // ---------------------------------------------------------------------------

  static const Color avatarText = Color(0xFFFFFFFF);

  static const Color avatarSaved = Color(0xFF4B5563);
  static const Color avatarSaved2 = Color(0xFF374151);

  static const Color avatarRed = Color(0xFFFF845E);
  static const Color avatarRed2 = Color(0xFFD45246);

  static const Color avatarOrange = Color(0xFFFEBB5B);
  static const Color avatarOrange2 = Color(0xFFF68136);

  static const Color avatarViolet = Color(0xFFB694F9);
  static const Color avatarViolet2 = Color(0xFF6C61DF);

  static const Color avatarGreen = Color(0xFF9AD164);
  static const Color avatarGreen2 = Color(0xFF46BA43);

  static const Color avatarCyan = Color(0xFF5BCBE3);
  static const Color avatarCyan2 = Color(0xFF359AD4);

  static const Color avatarBlue = Color(0xFF5CAFFA);
  static const Color avatarBlue2 = Color(0xFF408ACF);

  static const Color avatarPink = Color(0xFFFF8AAC);
  static const Color avatarPink2 = Color(0xFFD95574);

  static const Color avatarGray = Color(0xFFA1ABB5);

  // ---------------------------------------------------------------------------
  // Status colors
  // ---------------------------------------------------------------------------

  static const Color success = Color(0xFF40B135); // botKeyboard_button_success
  static const Color warning = Color(0xFFEBA52D); // key_color_yellow
  static const Color error = Color(0xFFE05356); // key_color_red
  static const Color danger = Color(0xFFDB4646); // botKeyboard_button_danger
  static const Color info = teledriveBlue;

  // ---------------------------------------------------------------------------
  // File / attachment colors
  // ---------------------------------------------------------------------------

  static const Color fileImage = Color(0xFF475263);
  static const Color fileVideo = Color(0xFF3B4352);
  static const Color fileAudio = Color(0xFF525A69);
  static const Color filePdf = Color(0xFFB94A4C);
  static const Color fileDocument = Color(0xFF475263);
  static const Color fileArchive = Color(0xFF646E7E);
  static const Color fileOther = Color(0xFF6B7280);

  // ---------------------------------------------------------------------------
  // teledrive chart / generic color set
  // ---------------------------------------------------------------------------

  static const Color colorBlue = Color(0xFF327FE5);
  static const Color colorGreen = Color(0xFF61C752);
  static const Color colorRed = Color(0xFFE05356);
  static const Color colorYellow = Color(0xFFEBA52D);
  static const Color colorLightBlue = Color(0xFF58A8ED);
  static const Color colorLightGreen = Color(0xFF8FCF39);
  static const Color colorOrange = Color(0xFFF28C39);
  static const Color colorPurple = Color(0xFF9F79E8);
  static const Color colorCyan = Color(0xFF40D0CA);

  // ---------------------------------------------------------------------------
  // Premium / gradients
  // ---------------------------------------------------------------------------

  static const Color premiumGradient0 = Color(0xFF4ACD43);
  static const Color premiumGradient1 = Color(0xFF55A5FF);
  static const Color premiumGradient2 = Color(0xFFA767FF);
  static const Color premiumGradient3 = Color(0xFFDB5C9D);
  static const Color premiumGradient4 = Color(0xFFF38926);

  // ---------------------------------------------------------------------------
  // Legacy aliases used across your app
  // ---------------------------------------------------------------------------

  static const Color primary = Color(0xFF141619);
  static const Color primaryLight = Color(0xFF32363D);
  static const Color primaryDark = Color(0xFF0F1113);
  static const Color primaryContainer = Color(0xFFEFF1F4);

  static const Color secondary = Color(0xFF33383F);
  static const Color secondaryLight = Color(0xFF4B515B);
  static const Color secondaryDark = Color(0xFF22262B);
  static const Color secondaryContainer = Color(0xFFE5E8EE);

  static const Color tertiary = Color(0xFF4B5563);
  static const Color tertiaryContainer = Color(0xFFF3F4F6);

  static const Color surfaceDark = Color(0xFF0C0E10);
  static const Color surfaceVariantDark = Color(0xFF15181C);
  static const Color backgroundDark = Color(0xFF090A0C);
  static const Color cardDark = Color(0xFF15181D);
  static const Color cardDarkAlt = Color(0xFF1E2229);
  static const Color dividerDark = Color(0xFF2B3039);

  static const Color surfaceLight = lightBg;
  static const Color surfaceVariantLight = lightSurface;
  static const Color cardLight = lightSurfaceElevated;
  static const Color cardLightAlt = lightSurfaceAlt;
  static const Color dividerLight = lightDivider;

  static const Color textPrimaryDark = Color(0xFFF9FAFB);
  static const Color textSecondaryDark = Color(0xFF9CA3AF);
  static const Color textHintDark = Color(0xFF6B7280);

  static const Color textPrimaryLight = lightTextPrimary;
  static const Color textSecondaryLight = lightTextSecondary;
  static const Color textHintLight = lightTextHint;

  // ---------------------------------------------------------------------------
  // Gradients
  // ---------------------------------------------------------------------------

  /// The custom washed-out blue gradient for white mode backgrounds
  static const LinearGradient washedBlueBackground = LinearGradient(
    begin: Alignment.topRight,
    end: Alignment.bottomLeft,
    stops: [0.0, 0.494, 0.978],
    colors: [
      Color(0x00FFFFFF), // Transparent white (0% opacity)
      Color(0x4D00A6FA), // #00A6FA at 30% opacity
      Color(0x00FFFFFF), // Transparent white (0% opacity)
    ],
  );

  static const LinearGradient primaryGradient = LinearGradient(
    colors: [
      Color(0xFF141619),
      Color(0xFF2C3038),
    ],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static const LinearGradient backgroundGradient = LinearGradient(
    colors: [
      lightBg,
      lightSurface,
      lightBg,
    ],
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
  );

  static const LinearGradient darkBackgroundGradient = LinearGradient(
    colors: [
      surfaceDark,
      surfaceVariantDark,
      surfaceDark,
    ],
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
  );

  static const LinearGradient cardGradient = LinearGradient(
    colors: [
      lightSurfaceElevated,
      lightSurfaceElevated,
    ],
  );

  static const LinearGradient premiumGradient = LinearGradient(
    colors: [
      premiumGradient1,
      premiumGradient2,
      premiumGradient3,
      premiumGradient4,
    ],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static const LinearGradient avatarBlueGradient = LinearGradient(
    colors: [
      avatarBlue,
      avatarBlue2,
    ],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static const LinearGradient avatarGreenGradient = LinearGradient(
    colors: [
      avatarGreen,
      avatarGreen2,
    ],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  static const LinearGradient avatarRedGradient = LinearGradient(
    colors: [
      avatarRed,
      avatarRed2,
    ],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  /// Dark Mode: The diagonal teal sweep (Layer 2)
  static const LinearGradient darkTealSweep = LinearGradient(
    begin: Alignment.topRight,
    end: Alignment.bottomLeft,
    stops: [0.0, 0.15, 0.5, 0.85, 1.0],
    colors: [
      Color(0x00167491), // 0% opacity teal (Transparent)
      Color(0x33167491), // 20% opacity teal - intermediate stop for smoothing
      Color(
          0x80167491), // 50% opacity teal - reduced from 100% to prevent harsh banding
      Color(0x33167491), // 20% opacity teal - intermediate stop for smoothing
      Color(0x00167491), // 0% opacity teal (Transparent)
    ],
  );

  /// Dark Mode: The vertical shadow overlay (Layer 3)
  static const LinearGradient darkVerticalOverlay = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [
      Color(0xFF1C2229), // 100% solid #1C2229 at the top
      Color(0x80242424), // 50% opacity #242424 at the bottom (0x80 = 50%)
    ],
  );
  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  static Color fileTypeColor(String type) {
    switch (type.toLowerCase()) {
      case 'image':
        return fileImage;
      case 'video':
        return fileVideo;
      case 'audio':
        return fileAudio;
      case 'pdf':
        return filePdf;
      case 'document':
        return fileDocument;
      case 'archive':
        return fileArchive;
      default:
        return fileOther;
    }
  }

  // ---------------------------------------------------------------------------
  // teledrive Glass Tab colors
  // Source: ThemeColors.java
  // ---------------------------------------------------------------------------

  static const Color glassDefaultIcon = Color(0x991B2227);
  static const Color glassDefaultText = Color(0x991B2227);

  static const Color glassTargetMainTabs = Color(0xFFFFFFFF);
  static const Color glassTargetMainTopPanel = Color(0xFFFFFFFF);

  static const Color glassTabSelected = Color(0xFF141619);
  static const Color glassTabSelectedText = Color(0xFF141619);
  static const Color glassTabUnselected = Color(0xFF6B7280);

  static const Color glassSelectedBackground = Color(0x15141619);

  static const Color glassBadgeBackground = teledriveBlue;
  static const Color glassBadgeErrorBackground = fillRedNormal;
  static const Color glassBadgeText = Color(0xFFFFFFFF);

  static const Color fillRedNormal = Color(0xFFEB5E5E);
}
