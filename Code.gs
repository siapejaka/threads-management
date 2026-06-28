const SPREADSHEET_ID = '1LebSjeffoOwlSrjyuFpnDYac3Y4uTJaRFDGwhrddBzQ';

// Serve Web App & API Webhook Endpoint for n8n
function doGet(e) {
  // Jika request datang dari n8n / sistem cron eksternal
  if (e && e.parameter && e.parameter.action === 'run_cron') {
    const token = e.parameter.token;
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const settingsSheet = ss.getSheetByName('Settings');
    const settingsData = settingsSheet.getDataRange().getValues();
    let cronToken = '';
    
    for (let i = 1; i < settingsData.length; i++) {
      if (settingsData[i][0] === 'CRON_TOKEN') {
        cronToken = settingsData[i][1];
        break;
      }
    }
    
    // Default fallback jika belum diatur
    if (!cronToken) cronToken = 'threads_cron_secret_123';
    
    if (token !== cronToken) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, message: 'Unauthorized Token!' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // Jalankan pemrosesan jadwal postingan
    processScheduledPosts();
    
    return ContentService.createTextOutput(JSON.stringify({ ok: true, message: 'Automation check completed successfully!' }))
        .setMimeType(ContentService.MimeType.JSON);
  }

  // Standar: Sajikan halaman Web App
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Threads Affiliate Suite')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// Helper to hash password with SHA-256
function hashPassword(password) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password, Utilities.Charset.UTF_8);
  let hexString = '';
  for (let i = 0; i < digest.length; i++) {
    let byteVal = digest[i];
    if (byteVal < 0) byteVal += 256;
    let byteString = byteVal.toString(16);
    if (byteString.length == 1) byteString = '0' + byteString;
    hexString += byteString;
  }
  return hexString;
}

// User Registration
function registerUser(username, email, password) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Users');
    const data = sheet.getDataRange().getValues();
    
    const cleanEmail = email.toLowerCase().trim();
    
    // Check if email already exists
    for (let i = 1; i < data.length; i++) {
      if (data[i][2].toLowerCase() === cleanEmail) {
        return { ok: false, message: 'Email sudah terdaftar!' };
      }
    }
    
    const userId = 'usr_' + Utilities.getUuid();
    const hash = hashPassword(password);
    
    // First registered user becomes ADMIN, others become USER
    const isFirstUser = sheet.getLastRow() <= 1;
    const role = isFirstUser ? 'ADMIN' : 'USER';
    
    sheet.appendRow([
      userId,
      username.trim(),
      cleanEmail,
      hash,
      role,
      new Date().toISOString()
    ]);
    
    return { 
      ok: true, 
      data: { userId: userId, username: username, email: cleanEmail, role: role } 
    };
  } catch (error) {
    return { ok: false, message: error.toString() };
  }
}

// User Login
function loginUser(username, password) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Users');
    const data = sheet.getDataRange().getValues();
    
    const cleanUsername = (username || '').toLowerCase().trim();
    const hash = hashPassword(password);
    
    for (let i = 1; i < data.length; i++) {
      const dbUsername = (data[i][1] || '').toLowerCase().trim();
      if (dbUsername === cleanUsername && data[i][3] === hash) {
        return { 
          ok: true, 
          data: { 
            userId: data[i][0], 
            username: data[i][1], 
            email: data[i][2], 
            role: data[i][4] || 'USER' 
          } 
        };
      }
    }
    
    return { ok: false, message: 'Username atau password salah.' };
  } catch (error) {
    return { ok: false, message: error.toString() };
  }
}

// ==========================================
// TEMPORARY SECURITY FUNCTION: RUN ONCE THEN DELETE!
// Fungsi ini digunakan untuk memaksa/mengubah akun tertentu menjadi ADMIN.
// CARA PAKAI: 
// 1. Ganti 'email-anda@domain.com' dengan email yang sudah Anda daftarkan.
// 2. Pilih fungsi 'forceAdminPrivilege' di dropdown editor atas, lalu klik Run (Jalankan).
// 3. Setelah sukses, HAPUS SELURUH BLOK KODE INI demi keamanan database Anda.
// ==========================================
function forceAdminPrivilege() {
  const targetEmail = 'soeltanvip@gmail.com'; // <-- GANTI DENGAN EMAIL ANDA
  const result = promoteToAdmin(targetEmail);
  Logger.log(result.message);
}

function promoteToAdmin(email) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Users');
    const data = sheet.getDataRange().getValues();
    const cleanEmail = email.toLowerCase().trim();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][2].toLowerCase() === cleanEmail) {
        // Kolom Role berada di indeks ke-4 (kolom ke-5)
        sheet.getRange(i + 1, 5).setValue('ADMIN');
        return { ok: true, message: 'SUKSES: Akun ' + email + ' sekarang menjadi ADMIN!' };
      }
    }
    return { ok: false, message: 'GAGAL: Email ' + email + ' tidak ditemukan di database. Silakan daftar dulu di aplikasi.' };
  } catch (error) {
    return { ok: false, message: 'ERROR: ' + error.toString() };
  }
}
// ==========================================

// Setup database tables
function setupDatabase() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  
  const tables = {
    'Settings': ['Key', 'Value'],
    'Users': ['UserID', 'Username', 'Email', 'PasswordHash', 'Role', 'CreatedAt'],
    'Accounts': ['AccountID', 'AccountName', 'ThreadsToken', 'ToneOfVoice', 'TargetAudience', 'Niche', 'UserID'],
    'Styles': ['StyleID', 'StyleName', 'FormulaDescription', 'CreatedAt'],
    'Products': ['ProductID', 'Title', 'Description', 'AffiliateLink', 'Price', 'Commission', 'Category', 'CreatedAt', 'UserID'],
    'ProductMedia': ['MediaID', 'ProductID', 'FileName', 'MediaType', 'MimeType', 'DriveFileID', 'PublicURL', 'CreatedAt', 'UserID'],
    'History': ['HistoryID', 'AccountName', 'ProductDetail', 'AffiliateLink', 'ThreadContent', 'Status', 'PostURL', 'Timestamp', 'UserID'],
    'Schedules': ['ScheduleID', 'AccountID', 'ProductName', 'AffiliateLink', 'ThreadDataJSON', 'ScheduledTime', 'Status', 'CreatedAt', 'UserID'],
    'DraftPosts': ['DraftID', 'AccountID', 'AccountName', 'ProductName', 'AffiliateLink', 'ThreadDataJSON', 'Status', 'CreatedAt', 'UpdatedAt', 'UserID'],
    'References': ['ReferenceID', 'Title', 'URL', 'Category', 'AccountName', 'Notes', 'SourceType', 'CreatedAt', 'UserID']
  };
  
  for (const tabName in tables) {
    let sheet = ss.getSheetByName(tabName);
    if (!sheet) {
      sheet = ss.insertSheet(tabName);
    }
    // Always update/overwrite header row
    const headers = tables[tabName];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  // Setup background automated trigger
  setupTrigger();
  
  // Seed default styles & settings if empty
  const settingsSheet = ss.getSheetByName('Settings');
  if (settingsSheet.getLastRow() <= 1) {
    settingsSheet.appendRow(['SUMOPOD_API_KEY', '']);
    settingsSheet.appendRow(['DEFAULT_MODEL', 'gpt-4o']);
    settingsSheet.appendRow(['API_BASE_URL', 'https://ai.sumopod.com']);
    settingsSheet.appendRow(['CRON_TOKEN', 'threads_cron_secret_123']);
  } else {
    // Pastikan CRON_TOKEN ada
    const data = settingsSheet.getDataRange().getValues();
    let hasCronToken = false;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === 'CRON_TOKEN') hasCronToken = true;
    }
    if (!hasCronToken) {
      settingsSheet.appendRow(['CRON_TOKEN', 'threads_cron_secret_123']);
    }
  }
  
  const stylesSheet = ss.getSheetByName('Styles');
  if (stylesSheet.getLastRow() <= 1) {
    stylesSheet.appendRow([
      'style_' + Utilities.getUuid(),
      'AIDA (Attention, Interest, Desire, Action)',
      'Hook kontradiktif untuk menarik perhatian, diikuti edukasi manfaat produk, lalu ditutup dengan link affiliate persuasif.',
      new Date().toISOString()
    ]);
    stylesSheet.appendRow([
      'style_' + Utilities.getUuid(),
      'Racun Belanja FOMO (Viral Indo)',
      'Gaya promosi heboh, penuh FOMO, emosional, menggunakan panggilan akrab netizen Indonesia (sis, rek, guys, pliss). Menonjolkan diskon, kepraktisan, dan urgensi agar langsung checkout.',
      new Date().toISOString()
    ]);
    stylesSheet.appendRow([
      'style_' + Utilities.getUuid(),
      'Spill Review Jujur (Soft Selling)',
      'Gaya bercerita seolah-olah baru membeli produk tersebut, mengupas kelebihan dan kegunaan secara personal, objektif namun sangat persuasif di akhir untuk spill link pembelian.',
      new Date().toISOString()
    ]);
    stylesSheet.appendRow([
      'style_' + Utilities.getUuid(),
      'Curhat Dramatis / Plot Twist (Storytelling)',
      'Dibuka dengan curhatan masalah hidup sehari-hari atau keresahan yang dramatis/lucu, lalu di tengah cerita mengenalkan produk sebagai solusi penyelamat masalah tersebut.',
      new Date().toISOString()
    ]);
  }
  
  return { ok: true, message: 'Database setup successfully completed!' };
}

// Setup Time-driven Trigger for Automation (Runs every 5 minutes)
function setupTrigger() {
  const functionName = 'processScheduledPosts';
  const triggers = ScriptApp.getProjectTriggers();
  let triggerExists = false;
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === functionName) {
      triggerExists = true;
      break;
    }
  }
  if (!triggerExists) {
    ScriptApp.newTrigger(functionName)
      .timeBased()
      .everyMinutes(5)
      .create();
  }
}

// Save a new scheduled post
function scheduleThread(accountId, posts, productName, affiliateLink, scheduledTimeStr, userId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Schedules');
    
    const scheduledDate = new Date(scheduledTimeStr);
    if (isNaN(scheduledDate.getTime())) {
      return { ok: false, message: 'Format tanggal dan waktu tidak valid.' };
    }
    
    if (scheduledDate <= new Date()) {
      return { ok: false, message: 'Waktu terjadwal harus berada di masa depan!' };
    }
    
    sheet.appendRow([
      'sch_' + Utilities.getUuid(),
      accountId,
      productName,
      affiliateLink,
      JSON.stringify(posts),
      scheduledDate.toISOString(),
      'PENDING',
      new Date().toISOString(),
      userId
    ]);
    
    return { ok: true, message: 'Postingan berhasil dijadwalkan!' };
  } catch (error) {
    return { ok: false, message: error.toString() };
  }
}

// Background Worker: Checks and publishes due schedules
function processScheduledPosts() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Schedules');
    if (!sheet) return;
    
    const data = sheet.getDataRange().getValues();
    const now = new Date();
    
    for (let i = 1; i < data.length; i++) {
      const status = data[i][6];
      const scheduledTimeStr = data[i][5];
      const scheduledDate = new Date(scheduledTimeStr);
      
      if (status === 'PENDING' && scheduledDate <= now) {
        const scheduleId = data[i][0];
        const accountId = data[i][1];
        const productName = data[i][2];
        const affiliateLink = data[i][3];
        const posts = JSON.parse(data[i][4]);
        const userId = data[i][8];
        
        // Mark as processing to prevent overlapping runs
        sheet.getRange(i + 1, 7).setValue('PROCESSING');
        SpreadsheetApp.flush();
        
        const res = publishThreadToMeta(accountId, posts, productName, affiliateLink, userId);
        
        if (res.ok) {
          sheet.getRange(i + 1, 7).setValue('SUCCESS');
        } else {
          sheet.getRange(i + 1, 7).setValue('FAILED: ' + res.message);
        }
      }
    }
  } catch (error) {
    Logger.log('Error processing schedules: ' + error.toString());
  }
}

// Cancel / Delete Pending Schedule
function deleteSchedule(scheduleId, userId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Schedules');
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === scheduleId && data[i][8] === userId) {
        sheet.deleteRow(i + 1);
        return { ok: true, message: 'Jadwal postingan berhasil dibatalkan!' };
      }
    }
    return { ok: false, message: 'Jadwal tidak ditemukan.' };
  } catch (error) {
    return { ok: false, message: error.toString() };
  }
}

function updateSchedule(scheduleId, posts, productName, affiliateLink, scheduledTimeStr, userId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Schedules');
    const data = sheet.getDataRange().getValues();

    const scheduledDate = new Date(scheduledTimeStr);
    if (isNaN(scheduledDate.getTime())) {
      return { ok: false, message: 'Format tanggal dan waktu tidak valid.' };
    }

    if (scheduledDate <= new Date()) {
      return { ok: false, message: 'Waktu terjadwal harus berada di masa depan!' };
    }

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === scheduleId && data[i][8] === userId) {
        sheet.getRange(i + 1, 3, 1, 5).setValues([[
          productName,
          affiliateLink,
          JSON.stringify(posts || []),
          scheduledDate.toISOString(),
          'PENDING'
        ]]);
        return {
          ok: true,
          data: {
            scheduleId: scheduleId,
            scheduledTime: scheduledDate.toISOString()
          },
          message: 'Jadwal postingan berhasil diperbarui.'
        };
      }
    }

    return { ok: false, message: 'Jadwal tidak ditemukan.' };
  } catch (error) {
    return { ok: false, message: error.toString() };
  }
}

function duplicateDraftPost(draftId, userId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('DraftPosts');
    const data = sheet.getDataRange().getValues();
    const nowIso = new Date().toISOString();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === draftId && data[i][9] === userId) {
        const newDraftId = 'drf_' + Utilities.getUuid();
        sheet.appendRow([
          newDraftId,
          data[i][1],
          data[i][2],
          data[i][3],
          data[i][4],
          data[i][5],
          'DRAFT',
          nowIso,
          nowIso,
          userId
        ]);

        return {
          ok: true,
          data: {
            draftId: newDraftId
          },
          message: 'Draft berhasil diduplikasi.'
        };
      }
    }

    return { ok: false, message: 'Draft tidak ditemukan.' };
  } catch (error) {
    return { ok: false, message: error.toString() };
  }
}

function saveDraftPost(draft, userId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('DraftPosts');
    const data = sheet.getDataRange().getValues();
    const nowIso = new Date().toISOString();

    let rowIndex = -1;
    let draftId = draft && draft.draftId ? String(draft.draftId) : '';

    if (draftId) {
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] === draftId && data[i][8] === userId) {
          rowIndex = i + 1;
          break;
        }
      }
    }

    if (!draftId) {
      draftId = 'drf_' + Utilities.getUuid();
    }

    const rowData = [
      draftId,
      draft.accountId || '',
      draft.accountName || '',
      draft.productName || '',
      draft.affiliateLink || '',
      JSON.stringify(draft.posts || []),
      'DRAFT',
      rowIndex !== -1 ? (draft.createdAt || data[rowIndex - 1][7] || nowIso) : nowIso,
      nowIso,
      userId
    ];

    if (rowIndex !== -1) {
      sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
    } else {
      sheet.appendRow(rowData);
    }

    return {
      ok: true,
      data: {
        draftId: draftId,
        updatedAt: nowIso
      },
      message: 'Draft berhasil disimpan permanen.'
    };
  } catch (error) {
    return { ok: false, message: error.toString() };
  }
}

function deleteDraftPost(draftId, userId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('DraftPosts');
    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === draftId && data[i][9] === userId) {
        sheet.deleteRow(i + 1);
        return { ok: true, message: 'Draft berhasil dihapus.' };
      }
    }

    return { ok: false, message: 'Draft tidak ditemukan.' };
  } catch (error) {
    return { ok: false, message: error.toString() };
  }
}

// Shared Helper: Recursive Serializer to ensure JSON safety
function serializeForClient(val) {
  if (val === null || val === undefined) return null;
  if (val instanceof Date) {
    return val.toISOString();
  }
  if (Array.isArray(val)) {
    return val.map(function(item) { return serializeForClient(item); });
  }
  if (typeof val === 'object') {
    var copy = {};
    for (var key in val) {
      if (val.hasOwnProperty(key)) {
        copy[key] = serializeForClient(val[key]);
      }
    }
    return copy;
  }
  return val;
}

// Fetch all initial data for the dashboard (Filtered by active UserID)
function getAppData(userId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    
    // Get User Role
    const usersSheet = ss.getSheetByName('Users');
    const usersData = usersSheet.getDataRange().getValues();
    let userRole = 'USER';
    for (let i = 1; i < usersData.length; i++) {
      if (usersData[i][0] === userId) {
        userRole = usersData[i][4] || 'USER';
        break;
      }
    }
    
    // Read Settings
    const settingsSheet = ss.getSheetByName('Settings');
    const settingsData = settingsSheet.getDataRange().getValues();
    const settings = {};
    let globalApiKey = '';
    let globalBaseUrl = '';
    let globalModel = 'gpt-4o';
    let globalCronToken = '';

    for (let i = 1; i < settingsData.length; i++) {
      const key = settingsData[i][0];
      const value = settingsData[i][1];

      if (key === 'SUMOPOD_API_KEY') globalApiKey = value;
      if (key === 'API_BASE_URL') globalBaseUrl = value;
      if (key === 'DEFAULT_MODEL') globalModel = value || 'gpt-4o';
      if (key === 'CRON_TOKEN') globalCronToken = value;

      if (key === 'SUMOPOD_API_KEY' && userRole !== 'ADMIN') {
        settings[key] = '';
      } else if (key === 'CRON_TOKEN' && userRole !== 'ADMIN') {
        settings[key] = '';
      } else {
        settings[key] = value;
      }
    }

    settings.USER_API_KEY = '';
    settings.USER_API_BASE_URL = globalBaseUrl || '';
    settings.USER_DEFAULT_MODEL = globalModel || 'gpt-4o';
    settings.EFFECTIVE_API_KEY = '';
    settings.EFFECTIVE_API_BASE_URL = globalBaseUrl || '';
    settings.EFFECTIVE_DEFAULT_MODEL = globalModel || 'gpt-4o';

    for (let i = 1; i < settingsData.length; i++) {
      const key = settingsData[i][0];
      const value = settingsData[i][1];

      if (key === 'USER_API_KEY_' + userId) {
        settings.USER_API_KEY = value || '';
      }
      if (key === 'USER_API_BASE_URL_' + userId) {
        settings.USER_API_BASE_URL = value || globalBaseUrl || '';
      }
      if (key === 'USER_DEFAULT_MODEL_' + userId) {
        settings.USER_DEFAULT_MODEL = value || globalModel || 'gpt-4o';
      }
    }

    settings.EFFECTIVE_API_KEY = settings.USER_API_KEY || globalApiKey || '';
    settings.EFFECTIVE_API_BASE_URL = settings.USER_API_BASE_URL || globalBaseUrl || '';
    settings.EFFECTIVE_DEFAULT_MODEL = settings.USER_DEFAULT_MODEL || globalModel || 'gpt-4o';
    
    // Read Accounts (Filter by UserID)
    const accountsSheet = ss.getSheetByName('Accounts');
    const accountsData = accountsSheet.getDataRange().getValues();
    const accounts = [];
    for (let i = 1; i < accountsData.length; i++) {
      if (accountsData[i][6] === userId) {
        accounts.push({
          accountId: accountsData[i][0],
          accountName: accountsData[i][1],
          threadsToken: accountsData[i][2],
          toneOfVoice: accountsData[i][3],
          targetAudience: accountsData[i][4],
          niche: accountsData[i][5]
        });
      }
    }
    
    // Read Styles
    const stylesSheet = ss.getSheetByName('Styles');
    const stylesData = stylesSheet.getDataRange().getValues();
    const styles = [];
    for (let i = 1; i < stylesData.length; i++) {
      styles.push({
        styleId: stylesData[i][0],
        styleName: stylesData[i][1],
        formulaDescription: stylesData[i][2],
        createdAt: stylesData[i][3]
      });
    }
    
    // Read Product Media (Filter by UserID)
    const productMediaSheet = ss.getSheetByName('ProductMedia');
    const productMediaData = productMediaSheet ? productMediaSheet.getDataRange().getValues() : [];
    const mediaByProductId = {};
    if (productMediaSheet) {
      for (let i = 1; i < productMediaData.length; i++) {
        if (productMediaData[i][8] === userId) {
          const productId = productMediaData[i][1];
          if (!mediaByProductId[productId]) {
            mediaByProductId[productId] = [];
          }
          mediaByProductId[productId].push({
            mediaId: productMediaData[i][0],
            productId: productMediaData[i][1],
            fileName: productMediaData[i][2],
            mediaType: productMediaData[i][3],
            mimeType: productMediaData[i][4],
            driveFileId: productMediaData[i][5],
            publicUrl: productMediaData[i][6],
            createdAt: productMediaData[i][7]
          });
        }
      }
    }

    // Read Products (Filter by UserID)
    const productsSheet = ss.getSheetByName('Products');
    const productsData = productsSheet.getDataRange().getValues();
    const products = [];
    for (let i = 1; i < productsData.length; i++) {
      if (productsData[i][8] === userId) {
        products.push({
          productId: productsData[i][0],
          title: productsData[i][1],
          description: productsData[i][2],
          affiliateLink: productsData[i][3],
          price: productsData[i][4],
          commission: productsData[i][5],
          category: productsData[i][6],
          createdAt: productsData[i][7],
          media: mediaByProductId[productsData[i][0]] || []
        });
      }
    }

    // Read History (Filter by UserID)
    const historySheet = ss.getSheetByName('History');
    const historyData = historySheet.getDataRange().getValues();
    const history = [];
    for (let i = 1; i < historyData.length; i++) {
      if (historyData[i][8] === userId) {
        let parsedPosts = [];
        const threadContentRaw = historyData[i][4] || '';
        const historyParts = String(threadContentRaw).split('\n---\n');
        for (let hp = 0; hp < historyParts.length; hp++) {
          parsedPosts.push({
            text: historyParts[hp],
            imageUrl: ''
          });
        }

        history.push({
          historyId: historyData[i][0],
          accountName: historyData[i][1],
          productDetail: historyData[i][2],
          affiliateLink: historyData[i][3],
          threadContent: historyData[i][4],
          status: historyData[i][5],
          postUrl: historyData[i][6],
          timestamp: historyData[i][7],
          posts: parsedPosts
        });
      }
    }

    // Read Schedules (Filter by UserID)
    const schedulesSheet = ss.getSheetByName('Schedules');
    const schedulesData = schedulesSheet ? schedulesSheet.getDataRange().getValues() : [];
    const schedules = [];
    if (schedulesSheet) {
      for (let i = 1; i < schedulesData.length; i++) {
        if (schedulesData[i][8] === userId) {
          let accName = schedulesData[i][1];
          for (let k = 0; k < accounts.length; k++) {
            if (accounts[k].accountId === schedulesData[i][1]) {
              accName = accounts[k].accountName;
              break;
            }
          }

          let parsedSchedulePosts = [];
          try {
            parsedSchedulePosts = JSON.parse(schedulesData[i][4] || '[]');
          } catch (e) {
            parsedSchedulePosts = [];
          }

          schedules.push({
            scheduleId: schedulesData[i][0],
            accountId: schedulesData[i][1],
            accountName: accName,
            productName: schedulesData[i][2],
            affiliateLink: schedulesData[i][3],
            posts: parsedSchedulePosts,
            scheduledTime: schedulesData[i][5],
            status: schedulesData[i][6],
            createdAt: schedulesData[i][7]
          });
        }
      }
    }

    const draftSheet = ss.getSheetByName('DraftPosts');
    const draftData = draftSheet ? draftSheet.getDataRange().getValues() : [];
    const drafts = [];
    if (draftSheet) {
      for (let i = 1; i < draftData.length; i++) {
        if (draftData[i][9] === userId) {
          let draftPosts = [];
          try {
            draftPosts = JSON.parse(draftData[i][5] || '[]');
          } catch (e) {
            draftPosts = [];
          }

          drafts.push({
            draftId: draftData[i][0],
            accountId: draftData[i][1],
            accountName: draftData[i][2],
            productName: draftData[i][3],
            affiliateLink: draftData[i][4],
            posts: draftPosts,
            status: draftData[i][6] || 'DRAFT',
            createdAt: draftData[i][7],
            updatedAt: draftData[i][8]
          });
        }
      }
    }

    const referencesSheet = ss.getSheetByName('References');
    const referencesData = referencesSheet ? referencesSheet.getDataRange().getValues() : [];
    const references = [];
    if (referencesSheet) {
      for (let i = 1; i < referencesData.length; i++) {
        if (referencesData[i][8] === userId) {
          references.push({
            referenceId: referencesData[i][0],
            title: referencesData[i][1],
            url: referencesData[i][2],
            category: referencesData[i][3],
            accountName: referencesData[i][4],
            notes: referencesData[i][5],
            sourceType: referencesData[i][6],
            createdAt: referencesData[i][7]
          });
        }
      }
    }
    
    return {
      ok: true,
      data: serializeForClient({
        settings: settings,
        accounts: accounts,
        styles: styles,
        products: products,
        history: history.reverse(), // Newest first
        schedules: schedules.reverse(),
        drafts: drafts.reverse(),
        references: references.reverse()
      })
    };
  } catch (error) {
    return { ok: false, message: error.toString() };
  }
}

// Save Settings
function saveSettings(apiKey, defaultModel, apiBaseUrl, cronToken, userId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Settings');
    const data = sheet.getDataRange().getValues();

    const usersSheet = ss.getSheetByName('Users');
    const usersData = usersSheet.getDataRange().getValues();
    let userRole = 'USER';
    for (let i = 1; i < usersData.length; i++) {
      if (usersData[i][0] === userId) {
        userRole = usersData[i][4] || 'USER';
        break;
      }
    }

    let keyFound = false;
    let modelFound = false;
    let baseFound = false;
    let cronFound = false;
    let userKeyFound = false;
    let userModelFound = false;
    let userBaseFound = false;

    const userApiKeySetting = 'USER_API_KEY_' + userId;
    const userModelSetting = 'USER_DEFAULT_MODEL_' + userId;
    const userBaseSetting = 'USER_API_BASE_URL_' + userId;
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === 'SUMOPOD_API_KEY') {
        if (userRole === 'ADMIN') {
          sheet.getRange(i + 1, 2).setValue(apiKey);
        }
        keyFound = true;
      }
      if (data[i][0] === 'DEFAULT_MODEL') {
        if (userRole === 'ADMIN') {
          sheet.getRange(i + 1, 2).setValue(defaultModel);
        }
        modelFound = true;
      }
      if (data[i][0] === 'API_BASE_URL') {
        if (userRole === 'ADMIN') {
          sheet.getRange(i + 1, 2).setValue(apiBaseUrl);
        }
        baseFound = true;
      }
      if (data[i][0] === 'CRON_TOKEN') {
        if (userRole === 'ADMIN') {
          sheet.getRange(i + 1, 2).setValue(cronToken);
        }
        cronFound = true;
      }

      if (data[i][0] === userApiKeySetting) {
        sheet.getRange(i + 1, 2).setValue(apiKey);
        userKeyFound = true;
      }
      if (data[i][0] === userModelSetting) {
        sheet.getRange(i + 1, 2).setValue(defaultModel);
        userModelFound = true;
      }
      if (data[i][0] === userBaseSetting) {
        sheet.getRange(i + 1, 2).setValue(apiBaseUrl);
        userBaseFound = true;
      }
    }
    
    if (!keyFound && userRole === 'ADMIN') sheet.appendRow(['SUMOPOD_API_KEY', apiKey]);
    if (!modelFound && userRole === 'ADMIN') sheet.appendRow(['DEFAULT_MODEL', defaultModel]);
    if (!baseFound && userRole === 'ADMIN') sheet.appendRow(['API_BASE_URL', apiBaseUrl]);
    if (!cronFound && userRole === 'ADMIN') sheet.appendRow(['CRON_TOKEN', cronToken]);

    if (!userKeyFound) sheet.appendRow([userApiKeySetting, apiKey]);
    if (!userModelFound) sheet.appendRow([userModelSetting, defaultModel]);
    if (!userBaseFound) sheet.appendRow([userBaseSetting, apiBaseUrl]);
    
    return { ok: true, message: userRole === 'ADMIN' ? 'Settings admin dan user berhasil disimpan!' : 'Settings API pribadi Anda berhasil disimpan!' };
  } catch (error) {
    return { ok: false, message: error.toString() };
  }
}

// Add or Edit Account
function saveAccount(account, userId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Accounts');
    const data = sheet.getDataRange().getValues();
    
    let index = -1;
    if (account.accountId) {
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] === account.accountId && data[i][6] === userId) {
          index = i + 1;
          break;
        }
      }
    }
    
    const rowData = [
      account.accountId || 'acc_' + Utilities.getUuid(),
      account.accountName,
      account.threadsToken,
      account.toneOfVoice,
      account.targetAudience,
      account.niche,
      userId
    ];
    
    if (index !== -1) {
      sheet.getRange(index, 1, 1, rowData.length).setValues([rowData]);
    } else {
      sheet.appendRow(rowData);
    }
    
    return { ok: true, message: 'Account saved successfully!' };
  } catch (error) {
    return { ok: false, message: error.toString() };
  }
}

function detectReferenceCategory_(inputUrl, inputTitle) {
  const source = ((inputUrl || '') + ' ' + (inputTitle || '')).toLowerCase();

  if (source.indexOf('threads.net') !== -1 || source.indexOf('thread') !== -1 || source.indexOf('/post/') !== -1) {
    return 'POSTINGAN_REFERENSI';
  }

  if (source.indexOf('@') !== -1 || source.indexOf('/profile/') !== -1 || source.indexOf('account') !== -1 || source.indexOf('creator') !== -1) {
    return 'AKUN_THREADS';
  }

  return 'POSTINGAN_REFERENSI';
}

function saveReferenceItem(reference, userId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('References');
    const data = sheet.getDataRange().getValues();
    const nowIso = new Date().toISOString();

    let rowIndex = -1;
    let referenceId = reference && reference.referenceId ? String(reference.referenceId) : '';

    if (referenceId) {
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] === referenceId && data[i][8] === userId) {
          rowIndex = i + 1;
          break;
        }
      }
    }

    if (!referenceId) {
      referenceId = 'ref_' + Utilities.getUuid();
    }

    const detectedCategory = detectReferenceCategory_(reference.url || '', reference.title || '');
    const finalCategory = (reference.category || detectedCategory || 'POSTINGAN_REFERENSI').trim();

    const rowData = [
      referenceId,
      reference.title || '',
      reference.url || '',
      finalCategory,
      reference.accountName || '',
      reference.notes || '',
      reference.sourceType || 'MANUAL',
      rowIndex !== -1 ? (data[rowIndex - 1][7] || nowIso) : nowIso,
      userId
    ];

    if (rowIndex !== -1) {
      sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
    } else {
      sheet.appendRow(rowData);
    }

    return {
      ok: true,
      data: {
        referenceId: referenceId,
        detectedCategory: detectedCategory,
        savedCategory: finalCategory
      },
      message: 'Referensi belajar berhasil disimpan.'
    };
  } catch (error) {
    return { ok: false, message: error.toString() };
  }
}

function deleteReferenceItem(referenceId, userId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('References');
    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === referenceId && data[i][8] === userId) {
        sheet.deleteRow(i + 1);
        return { ok: true, message: 'Referensi belajar berhasil dihapus.' };
      }
    }

    return { ok: false, message: 'Referensi tidak ditemukan.' };
  } catch (error) {
    return { ok: false, message: error.toString() };
  }
}

// Delete Account
function deleteAccount(accountId, userId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Accounts');
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === accountId && data[i][6] === userId) {
        sheet.deleteRow(i + 1);
        return { ok: true, message: 'Account deleted successfully!' };
      }
    }
    return { ok: false, message: 'Account not found.' };
  } catch (error) {
    return { ok: false, message: error.toString() };
  }
}

// Sumopod AI Call Helper
function normalizeAiEndpoint_(baseUrl) {
  var cleaned = (baseUrl || '').trim();
  if (!cleaned) {
    throw new Error('API Base URL is not set in Settings. Buka tab Settings lalu isi base URL AI Anda.');
  }

  while (cleaned.substring(cleaned.length - 1) === '/') {
    cleaned = cleaned.substring(0, cleaned.length - 1);
  }

  if (cleaned.indexOf('/chat/completions') !== -1) {
    return cleaned;
  }

  return cleaned + '/chat/completions';
}

function callSumopodAI(systemPrompt, userPrompt, userId) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const settingsSheet = ss.getSheetByName('Settings');
  const data = settingsSheet.getDataRange().getValues();
  
  let apiKey = '';
  let model = 'gpt-4o';
  let baseUrl = 'https://api.sumopod.com/v1';
  let userApiKey = '';
  let userModel = '';
  let userBaseUrl = '';
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === 'SUMOPOD_API_KEY') apiKey = data[i][1];
    if (data[i][0] === 'DEFAULT_MODEL') model = data[i][1];
    if (data[i][0] === 'API_BASE_URL') baseUrl = data[i][1];
    if (data[i][0] === 'USER_API_KEY_' + userId) userApiKey = data[i][1];
    if (data[i][0] === 'USER_DEFAULT_MODEL_' + userId) userModel = data[i][1];
    if (data[i][0] === 'USER_API_BASE_URL_' + userId) userBaseUrl = data[i][1];
  }

  apiKey = userApiKey || apiKey;
  model = userModel || model;
  baseUrl = userBaseUrl || baseUrl;
  
  if (!apiKey) {
    throw new Error('API Key AI belum diatur untuk akun Anda. Buka tab Settings lalu isi API key pribadi Anda.');
  }

  const url = normalizeAiEndpoint_(baseUrl);
  const payload = {
    model: model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.7
  };
  
  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + apiKey
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  const response = UrlFetchApp.fetch(url, options);
  const responseCode = response.getResponseCode();
  const responseText = response.getContentText();
  
  if (responseCode !== 200) {
    let readableMessage = 'AI API Error: ' + responseText;
    try {
      const parsed = JSON.parse(responseText);
      if (parsed && parsed.error && parsed.error.message) {
        readableMessage = 'AI API Error: ' + parsed.error.message;
      }
    } catch (e) {}
    throw new Error(readableMessage);
  }
  
  const json = JSON.parse(responseText);
  if (!json.choices || !json.choices[0] || !json.choices[0].message) {
    throw new Error('AI API response tidak valid. Periksa model, API key, dan base URL di Settings.');
  }
  return json.choices[0].message.content;
}

// Generate Threads via AI
function generateThreadWithAI(params, userId) {
  try {
    const systemPrompt = 'You are an expert Threads copywriter and affiliate marketer who specializes in Indonesian viral social media trends (FYP style). ' +
      'Your job is to generate highly engaging, scroll-stopping threads that subtly plug affiliate products. ' +
      'Format the output strictly as individual posts separated by [POST_BREAK] markers. ' +
      'Do not include numbering like "Post 1:" or "1/" in the text itself. Just write raw post content. ' +
      'Always structure the thread logically based on the requested style.';
      
    let styleInstructions = '';
    if (params.styleFormula.indexOf('Racun Belanja') !== -1) {
      styleInstructions = 'Gaya "Racun Belanja FOMO (Viral Indo)": Gunakan gaya promosi heboh, penuh FOMO (Fear of Missing Out), emosional, menggunakan panggilan akrab netizen Indonesia (sis, rek, guys, pliss, bund). Menonjolkan diskon, kepraktisan, dan urgensi agar langsung checkout. Contoh kalimat pembuka: "PLISSS kalian harus tau racun yang satu ini..." atau "Nangis banget baru tau ada barang se-useful ini...".';
    } else if (params.styleFormula.indexOf('Curhat') !== -1) {
      styleInstructions = 'Gaya "Curhat Dramatis / Plot Twist (Storytelling)": Dibuka dengan curhatan masalah hidup sehari-hari atau keresahan yang dramatis, lucu, atau relatable bagi netizen Indonesia (misal: "Capek banget tiap hari begadang gara-gara...", "Gara-gara overthink semaleman, akhirnya..."). Lalu di tengah cerita mengenalkan produk secara halus sebagai solusi penyelamat masalah tersebut.';
    } else if (params.styleFormula.indexOf('Spill Review') !== -1) {
      styleInstructions = 'Gaya "Spill Review Jujur (Soft Selling)": Gaya bercerita seolah-olah baru membeli produk tersebut, mengupas kelebihan dan kegunaan secara personal, jujurly, objektif namun sangat persuasif di akhir untuk spill link pembelian.';
    } else {
      styleInstructions = 'Gaya ' + params.styleFormula + ': Sesuaikan dengan formula ini.';
    }

    const userPrompt = 'Create an affiliate thread in INDONESIAN of exactly ' + params.postCount + ' posts.\n\n' +
      'Product Name: ' + params.productName + '\n' +
      'Product Description: ' + params.productDesc + '\n' +
      'Affiliate Link: ' + params.affiliateLink + '\n' +
      'Tone of Voice: ' + params.toneOfVoice + '\n' +
      'Target Audience: ' + params.targetAudience + '\n' +
      'Style Formula: ' + params.styleFormula + '\n\n' +
      'Style Guidelines:\n' + styleInstructions + '\n\n' +
      'Instructions:\n' +
      '- Write entirely in natural, highly engaging conversational Indonesian. Use popular local internet slang where appropriate to maximize engagement.\n' +
      '- Post 1 must be a powerful Hook.\n' +
      '- Intermediate posts must provide immense value, education, or storytelling.\n' +
      '- The final post must contain a persuasive CTA but do NOT output a clickable raw URL.\n' +
      '- If mentioning the affiliate link, write it in anti-preview format such as replacing "." with "[.]" and "https://" with "https ://".\n' +
      '- Separate each post with [POST_BREAK].';
      
    const rawResult = callSumopodAI(systemPrompt, userPrompt, userId);
    const posts = rawResult.split('[POST_BREAK]').map(function(p) { return p.trim(); }).filter(Boolean);
    
    return { ok: true, data: posts };
  } catch (error) {
    return { ok: false, message: error.toString() };
  }
}

// Analyze Viral Thread with AI
function analyzeThreadWithAI(rawText, userId) {
  try {
    const systemPrompt = 'You are a viral social media scientist. ' +
      'Analyze the viral thread provided and extract its underlying copywriting formula/structure. ' +
      'Explain the Hook mechanism, the body progression, and the CTA strategy. ' +
      'Format your output as a clear, structured blueprint/description.';
      
    const userPrompt = 'Analyze this viral thread and extract its blueprint:\n\n' + rawText;
    const analysis = callSumopodAI(systemPrompt, userPrompt, userId);
    
    return { ok: true, data: analysis };
  } catch (error) {
    return { ok: false, message: error.toString() };
  }
}

// Save Style Formula
function saveStyle(styleName, formulaDesc) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Styles');
    sheet.appendRow([
      'style_' + Utilities.getUuid(),
      styleName,
      formulaDesc,
      new Date().toISOString()
    ]);
    return { ok: true, message: 'Style formula saved successfully!' };
  } catch (error) {
    return { ok: false, message: error.toString() };
  }
}

// Delete Style Formula
function deleteStyle(styleId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Styles');
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === styleId) {
        sheet.deleteRow(i + 1);
        return { ok: true, message: 'Style deleted successfully!' };
      }
    }
    return { ok: false, message: 'Style not found.' };
  } catch (error) {
    return { ok: false, message: error.toString() };
  }
}

function getOrCreateProductMediaFolder_() {
  var folderName = 'Threads Affiliate Media';
  var folders = DriveApp.getFoldersByName(folderName);
  if (folders.hasNext()) {
    return folders.next();
  }
  return DriveApp.createFolder(folderName);
}

function buildDrivePublicUrl_(fileId, mimeType) {
  if (mimeType && mimeType.indexOf('video/') === 0) {
    return 'https://drive.google.com/uc?export=download&id=' + fileId;
  }
  return 'https://lh3.googleusercontent.com/d/' + fileId;
}

// Upload product media to Google Drive and return public link
function uploadProductMedia(base64Data, fileName, mimeType) {
  try {
    var splitData = base64Data.split(',');
    var actualData = splitData.length > 1 ? splitData[1] : splitData[0];
    var decoded = Utilities.base64Decode(actualData);
    var blob = Utilities.newBlob(decoded, mimeType, fileName);
    var folder = getOrCreateProductMediaFolder_();
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    var fileId = file.getId();
    var mediaType = mimeType && mimeType.indexOf('video/') === 0 ? 'VIDEO' : 'IMAGE';
    var publicUrl = buildDrivePublicUrl_(fileId, mimeType);

    return {
      ok: true,
      data: {
        fileName: fileName,
        mimeType: mimeType,
        mediaType: mediaType,
        driveFileId: fileId,
        publicUrl: publicUrl
      }
    };
  } catch (error) {
    return { ok: false, message: error.toString() };
  }
}

// Fetch remote URL and upload directly to Google Drive
function uploadProductMediaByUrl(url, customFileName) {
  try {
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (response.getResponseCode() !== 200) {
      throw new Error('Gagal mengambil file dari URL. Kode Status: ' + response.getResponseCode());
    }

    const blob = response.getBlob();
    const mimeType = blob.getContentType();
    
    // Tentukan nama file
    let fileName = customFileName ? customFileName.trim() : '';
    if (!fileName) {
      const urlParts = url.split('/');
      const lastPart = urlParts[urlParts.length - 1].split('?')[0];
      fileName = lastPart || 'media_' + Utilities.getUuid().substring(0, 8);
    }

    // Berikan ekstensi file cadangan jika tidak ada
    if (fileName.indexOf('.') === -1) {
      if (mimeType.indexOf('image/webp') !== -1) fileName += '.webp';
      else if (mimeType.indexOf('image/jpeg') !== -1) fileName += '.jpg';
      else if (mimeType.indexOf('image/png') !== -1) fileName += '.png';
      else if (mimeType.indexOf('video/mp4') !== -1) fileName += '.mp4';
      else if (mimeType.indexOf('video/') !== -1) fileName += '.mp4';
      else fileName += '.bin';
    }

    const folder = getOrCreateProductMediaFolder_();
    const file = folder.createFile(blob);
    file.setName(fileName);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    const fileId = file.getId();
    const mediaType = mimeType && mimeType.indexOf('video/') === 0 ? 'VIDEO' : 'IMAGE';
    const publicUrl = buildDrivePublicUrl_(fileId, mimeType);

    return {
      ok: true,
      data: {
        fileName: fileName,
        mimeType: mimeType,
        mediaType: mediaType,
        driveFileId: fileId,
        publicUrl: publicUrl
      }
    };
  } catch (error) {
    return { ok: false, message: error.toString() };
  }
}

function saveProductMedia(productId, mediaItems, userId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('ProductMedia');
    const data = sheet.getDataRange().getValues();

    for (let i = data.length - 1; i >= 1; i--) {
      if (data[i][1] === productId && data[i][8] === userId) {
        sheet.deleteRow(i + 1);
      }
    }

    if (mediaItems && mediaItems.length > 0) {
      for (let j = 0; j < mediaItems.length; j++) {
        const item = mediaItems[j];
        sheet.appendRow([
          item.mediaId || 'med_' + Utilities.getUuid(),
          productId,
          item.fileName || '',
          item.mediaType || 'IMAGE',
          item.mimeType || '',
          item.driveFileId || '',
          item.publicUrl || '',
          new Date().toISOString(),
          userId
        ]);
      }
    }

    return { ok: true, data: { productId: productId, mediaCount: mediaItems ? mediaItems.length : 0 } };
  } catch (error) {
    return { ok: false, message: error.toString() };
  }
}

// Add or Edit Product
function saveProduct(product, userId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Products');
    const data = sheet.getDataRange().getValues();
    
    let index = -1;
    let productId = product.productId || 'prod_' + Utilities.getUuid();
    if (product.productId) {
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] === product.productId && data[i][8] === userId) {
          index = i + 1;
          break;
        }
      }
    }
    
    const rowData = [
      productId,
      product.title,
      product.description,
      product.affiliateLink,
      product.price,
      product.commission,
      product.category,
      product.createdAt || new Date().toISOString(),
      userId
    ];
    
    if (index !== -1) {
      sheet.getRange(index, 1, 1, rowData.length).setValues([rowData]);
    } else {
      sheet.appendRow(rowData);
    }

    const mediaSaveResult = saveProductMedia(productId, product.media || [], userId);
    if (!mediaSaveResult.ok) {
      return { ok: false, message: mediaSaveResult.message };
    }
    
    return { ok: true, data: { productId: productId } };
  } catch (error) {
    return { ok: false, message: error.toString() };
  }
}

// Delete Product
function deleteProduct(productId, userId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Products');
    const mediaSheet = ss.getSheetByName('ProductMedia');
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === productId && data[i][8] === userId) {
        sheet.deleteRow(i + 1);

        if (mediaSheet) {
          const mediaData = mediaSheet.getDataRange().getValues();
          for (let j = mediaData.length - 1; j >= 1; j--) {
            if (mediaData[j][1] === productId && mediaData[j][8] === userId) {
              const driveFileId = mediaData[j][5];
              if (driveFileId) {
                try {
                  DriveApp.getFileById(driveFileId).setTrashed(true);
                } catch (e) {}
              }
              mediaSheet.deleteRow(j + 1);
            }
          }
        }

        return { ok: true, message: 'Product deleted successfully!' };
      }
    }
    return { ok: false, message: 'Product not found.' };
  } catch (error) {
    return { ok: false, message: error.toString() };
  }
}

// Test Connection to Meta Threads API for a Specific Account
function testThreadsConnection(accountId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const accountsSheet = ss.getSheetByName('Accounts');
    const accountsData = accountsSheet.getDataRange().getValues();
    
    let token = '';
    let accountName = '';
    
    for (let i = 1; i < accountsData.length; i++) {
      if (accountsData[i][0] === accountId) {
        token = accountsData[i][2];
        accountName = accountsData[i][1];
        break;
      }
    }
    
    if (!token) {
      throw new Error('Access Token not found for this account.');
    }
    
    // Handle simulated mock token
    if (token.toLowerCase() === 'mock' || token.toLowerCase() === 'test') {
      Utilities.sleep(1000); // Simulate network delay
      return { ok: true, message: 'Mock connection successful! (Account: ' + accountName + ')' };
    }
    
    // Real Meta Graph API Call to verify token
    const url = 'https://graph.threads.net/v1.0/me?fields=id,username';
    const options = {
      method: 'get',
      headers: {
        'Authorization': 'Bearer ' + token
      },
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    if (responseCode === 200) {
      const json = JSON.parse(responseText);
      return { 
        ok: true, 
        message: 'Connection verified successfully! Username: @' + json.username + ' (ID: ' + json.id + ')' 
      };
    } else {
      const errJson = JSON.parse(responseText);
      const errMsg = errJson.error && errJson.error.message ? errJson.error.message : responseText;
      return { 
        ok: false, 
        message: 'API Verification Failed (Code ' + responseCode + '): ' + errMsg 
      };
    }
    
  } catch (error) {
    return { ok: false, message: 'Connection error: ' + error.toString() };
  }
}

// Helper to poll Meta container status until it is FINISHED (ready to publish)
function waitForContainerToBeReady(containerId, token) {
  const url = 'https://graph.threads.net/v1.0/' + containerId + '?fields=status,error_message';
  const options = {
    method: 'get',
    headers: { 'Authorization': 'Bearer ' + token },
    muteHttpExceptions: true
  };
  
  // Poll up to 15 times with 1.5-second delay (max 22.5 seconds)
  for (let attempt = 0; attempt < 15; attempt++) {
    Utilities.sleep(1500);
    const res = UrlFetchApp.fetch(url, options);
    if (res.getResponseCode() === 200) {
      const json = JSON.parse(res.getContentText());
      if (json.status === 'FINISHED') {
        return true;
      }
      if (json.status === 'ERROR') {
        throw new Error('Container processing failed: ' + (json.error_message || 'Unknown Meta processing error.'));
      }
    }
  }
  throw new Error('Timeout waiting for container ' + containerId + ' to finish processing at Meta.');
}

function sanitizeThreadTextForPublish_(text, affiliateLink) {
  var result = String(text || '');

  if (!affiliateLink) {
    return result;
  }

  var cleanLink = String(affiliateLink).trim();
  if (!cleanLink) {
    return result;
  }

  var disguisedLink = cleanLink.replace('https://', 'https ://').replace('http://', 'http ://').replace(/\./g, '[.]');
  result = result.split(cleanLink).join(disguisedLink);

  return result;
}

// Publish Threads Sequentially to Meta Threads API
function publishThreadToMeta(accountId, posts, productName, affiliateLink, userId) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    
    // Get Account Token
    const accountsSheet = ss.getSheetByName('Accounts');
    const accountsData = accountsSheet.getDataRange().getValues();
    let token = '';
    let accountName = '';
    
    for (let i = 1; i < accountsData.length; i++) {
      const dbAccountId = accountsData[i][0];
      const dbUserId = accountsData[i][6];
      
      // Pencocokan cerdas: Cocokkan ID Akun. Jika kolom UserID di database kosong (akun lama),
      // atau jika cocok dengan UserID aktif saat ini, maka ijinkan akses token.
      if (dbAccountId === accountId && (!dbUserId || dbUserId === userId)) {
        token = accountsData[i][2];
        accountName = accountsData[i][1];
        break;
      }
    }
    
    if (!token) {
      throw new Error('Threads Access Token tidak ditemukan untuk akun ID: ' + accountId + ' (User: ' + userId + '). Pastikan akun Threads sudah dikonfigurasi ulang.');
    }
    
    // Simulate flow if token is 'mock' or 'test' for safe beginner testing
    if (token.toLowerCase() === 'mock' || token.toLowerCase() === 'test') {
      Utilities.sleep(2000); // simulate API delay
      const mockUrl = 'https://www.threads.net/' + accountName + '/post/mock_' + Utilities.getUuid().substring(0,8);
      
      // Log to History
      const historySheet = ss.getSheetByName('History');
      historySheet.appendRow([
        'hist_' + Utilities.getUuid(),
        accountName,
        productName,
        affiliateLink,
        posts.map(function(p) { return sanitizeThreadTextForPublish_(p.text, affiliateLink); }).join('\n---\n'),
        'SUCCESS (MOCK)',
        mockUrl,
        new Date().toISOString(),
        userId
      ]);
      
      return { ok: true, message: 'Mock Posting Successful!', data: mockUrl };
    }
    
    // Real Meta Threads API Sequential Posting
    let lastPostId = null;
    let mainPostUrl = '';
    
    for (let i = 0; i < posts.length; i++) {
      const postObj = posts[i];
      const textContent = sanitizeThreadTextForPublish_(postObj.text || '', affiliateLink);
      const imageUrl = postObj.imageUrl || '';
      
      // Step 1: Create Container
      const containerUrl = 'https://graph.threads.net/v1.0/me/threads';
      const containerPayload = {
        media_type: imageUrl ? 'IMAGE' : 'TEXT',
        text: textContent
      };
      
      if (imageUrl) {
        containerPayload.image_url = imageUrl;
      }
      
      if (lastPostId) {
        containerPayload.reply_to_id = lastPostId;
      }
      
      const containerOptions = {
        method: 'post',
        headers: { 'Authorization': 'Bearer ' + token },
        payload: containerPayload,
        muteHttpExceptions: true
      };
      
      const containerRes = UrlFetchApp.fetch(containerUrl, containerOptions);
      const containerJson = JSON.parse(containerRes.getContentText());
      
      if (!containerJson.id) {
        throw new Error('Failed to create container at post ' + (i+1) + ': ' + containerRes.getContentText());
      }
      
      const containerId = containerJson.id;
      
      // Wait for container to be ready at Meta (Critical for sequential threads/images)
      waitForContainerToBeReady(containerId, token);
      
      // Step 2: Publish Container
      const publishUrl = 'https://graph.threads.net/v1.0/me/threads_publish';
      const publishPayload = { creation_id: containerId };
      const publishOptions = {
        method: 'post',
        headers: { 'Authorization': 'Bearer ' + token },
        payload: publishPayload,
        muteHttpExceptions: true
      };
      
      const publishRes = UrlFetchApp.fetch(publishUrl, publishOptions);
      const publishJson = JSON.parse(publishRes.getContentText());
      
      if (!publishJson.id) {
        throw new Error('Failed to publish post ' + (i+1) + ': ' + publishRes.getContentText());
      }
      
      lastPostId = publishJson.id;
      
      // Assume main thread URL is based on first post ID
      if (i === 0) {
        mainPostUrl = 'https://www.threads.net/post/' + lastPostId;
      }
      
      // Safe delay between sequential posts to prevent rate-limit / spam blocks
      Utilities.sleep(1500);
    }
    
    // Log to History
    const historyTextLog = posts.map(function(p) { 
      return sanitizeThreadTextForPublish_(p.text, affiliateLink) + (p.imageUrl ? ' [Image: ' + p.imageUrl + ']' : ''); 
    }).join('\n---\n');

    const historySheet = ss.getSheetByName('History');
    historySheet.appendRow([
      'hist_' + Utilities.getUuid(),
      accountName,
      productName,
      affiliateLink,
      historyTextLog,
      'SUCCESS',
      mainPostUrl,
      new Date().toISOString(),
      userId
    ]);
    
    return { ok: true, message: 'Thread successfully posted to Threads!', data: mainPostUrl };
    
  } catch (error) {
    // Log failed attempt
    try {
      const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      const historySheet = ss.getSheetByName('History');
      historySheet.appendRow([
        'hist_' + Utilities.getUuid(),
        accountId,
        productName,
        affiliateLink,
        posts.join('\n---\n'),
        'FAILED',
        error.toString(),
        new Date().toISOString(),
        userId
      ]);
    } catch(e) {}
    
    return { ok: false, message: error.toString() };
  }
}
