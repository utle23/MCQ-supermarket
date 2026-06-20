/* ============================================================================
   Bilingual VI/EN — isolated, zero changes to app logic.
   A catch-all DOM translator: after any render, text nodes (and input
   placeholders) whose exact text matches a dictionary entry are swapped to
   Vietnamese. English is the source; switching back to EN just re-renders.
   ============================================================================ */
(function(){
  var DICT = {
    // ---- nav groups ----
    'Dashboard':'Trang chủ','Operations':'Vận hành','Staff & HR':'Nhân sự','Management':'Quản lý',
    'Reports & Rules':'Báo cáo & Nội quy','AI Lab':'Phòng AI','Account':'Tài khoản',
    // ---- nav items / page titles ----
    'Store Operation Checklist':'Checklist vận hành cửa hàng','Checklist':'Checklist',
    'Cleaning & Maintenance':'Vệ sinh & Bảo trì','Delivery':'Giao hàng','People':'Nhân viên',
    'Staff Structure':'Sơ đồ nhân sự','Staff Members':'Danh sách nhân viên','Job Schedule':'Lịch làm việc',
    'Performance & Scoring':'Hiệu suất & Điểm','Training Assessment':'Đánh giá đào tạo','Training':'Đào tạo',
    'Violation Rules':'Vi phạm & Nội quy','Monthly Rewards':'Khen thưởng tháng','Raise Salary Review':'Xét tăng lương',
    'Birthday Giveaways':'Quà sinh nhật','Manager Panel':'Bảng quản lý','Analytics':'Phân tích',
    'Photo Gallery':'Thư viện ảnh','WhatsApp Daily Share':'Chia sẻ WhatsApp','Email Notifications':'Thông báo Email',
    'Data Management':'Quản lý dữ liệu','Data':'Dữ liệu','Restaurant Rules':'Nội quy','Rules':'Nội quy',
    'Report Issue':'Báo cáo sự cố','Report an Issue':'Báo cáo sự cố','Face ID':'Face ID',
    'Maintenance':'Bảo trì','Incidents':'Sự cố','Complaints':'Khiếu nại','Schedules':'Lịch',
    // ---- common actions / buttons ----
    'New':'Tạo mới','Records':'Bản ghi','Overview':'Tổng quan','Records & Review':'Bản ghi & Duyệt','My Records':'Bản ghi của tôi','My records':'Bản ghi của tôi',
    'Save':'Lưu','Save changes':'Lưu thay đổi','Delete':'Xóa','Cancel':'Hủy','Submit':'Gửi','Submit Report':'Gửi báo cáo',
    'Export':'Xuất','Print':'In','PDF':'PDF','Excel':'Excel','Word':'Word','Clear':'Xóa lọc','Search':'Tìm kiếm',
    'Add task':'Thêm việc','Add area':'Thêm khu','Add branch':'Thêm chi nhánh','Done':'Xong','Back':'Quay lại',
    'Review & Verify':'Xem & Xác nhận','Verify this checklist':'Xác nhận checklist này','Newest first':'Mới nhất','Oldest first':'Cũ nhất',
    'Send test':'Gửi thử','New session':'Buổi mới','Customise':'Tùy chỉnh','Live editor':'Sửa trực tiếp',
    'All tools':'Tất cả công cụ','Leaderboard':'Bảng xếp hạng','Ask':'Hỏi','New photo':'Ảnh mới','Copy':'Sao chép','Copy reply':'Sao chép thư',
    // ---- login ----
    'Welcome back':'Chào mừng trở lại','Sign in to your store operations workspace.':'Đăng nhập vào không gian vận hành cửa hàng.',
    'Supermarket Operations Platform':'Nền tảng vận hành siêu thị','Store / Branch':'Cửa hàng / Chi nhánh','Password':'Mật khẩu',
    'Enter password':'Nhập mật khẩu','Sign In →':'Đăng nhập →','Sign in with Face ID':'Đăng nhập bằng Face ID','or':'hoặc',
    'Staff':'Nhân viên','Admin':'Quản trị','Super':'Tổng quản trị','Scanning face…':'Đang quét khuôn mặt…','Look at the camera':'Nhìn vào camera',
    // ---- checklist ----
    'Opening':'Ca sáng','Closing':'Ca tối','Sections':'Khu vực','Submit Opening checklist':'Gửi checklist ca sáng','Submit Closing checklist':'Gửi checklist ca tối',
    'Add note…':'Thêm ghi chú…','Date':'Ngày',
    // ---- KPI / common labels ----
    'Open items':'Mục đang mở','Stores':'Cửa hàng','Store':'Cửa hàng','Critical / Major':'Nghiêm trọng','Critical / urgent':'Khẩn cấp',
    'Awaiting verification':'Chờ xác nhận','Verified today':'Đã xác nhận hôm nay','Open issues':'Sự cố đang mở','Pending':'Chờ xử lý',
    'Daily Operations':'Vận hành hằng ngày','Recent activity':'Hoạt động gần đây','Open items by module':'Mục đang mở theo phần',
    'Pending Verification':'Chờ xác nhận','Activity Log':'Nhật ký hoạt động','Total reports':'Tổng báo cáo','Categories':'Danh mục','Branches':'Chi nhánh',
    'Scheduled jobs':'Công việc theo lịch','Overdue':'Quá hạn','Due soon':'Sắp đến hạn','On track':'Đúng tiến độ',
    'Staff scored':'Nhân viên được chấm','Average score':'Điểm trung bình','At risk':'Cần chú ý',
    'Your name':'Tên của bạn','Priority':'Ưu tiên','Severity':'Mức độ','Channel':'Kênh','Department':'Bộ phận',
    'What would you like to report?':'Bạn muốn báo cáo điều gì?','Issue details':'Chi tiết sự cố',
    'Team on shift':'Nhân viên trong ca','Key daily duties':'Công việc chính trong ngày','Daily duties by department':'Công việc theo bộ phận',
    "This week's roster":'Lịch tuần này','Coverage by department':'Phân bổ theo bộ phận',
    'Sending method':'Phương thức gửi','Responsible':'Người phụ trách','Status':'Trạng thái','Action':'Hành động',
    // ---- checklist sessions & builder ----
    'Mid-afternoon':'Ca chiều','Submit Mid-afternoon checklist':'Gửi checklist ca chiều',
    'Check all done':'Đánh dấu hoàn tất','Uncheck all':'Bỏ chọn tất cả','Builder mode':'Chế độ chỉnh sửa',
    'Add department':'Thêm bộ phận','Add section':'Thêm khu vực','Delete section':'Xóa khu vực',
    'Delete dept':'Xóa bộ phận','Section':'Khu vực','Add':'Thêm','Deadline':'Hạn chót','OVERDUE':'QUÁ HẠN',
    'Confirm':'Xác nhận','Retake':'Chụp lại','Defrosting':'Đang rã đông','Today':'Hôm nay','Share PDF':'Chia sẻ PDF',
    'Checklist submitted':'Đã gửi checklist','tasks done':'việc hoàn tất','complete':'hoàn thành',
    // ---- needs attention + dashboard today ----
    'Needs attention':'Cần xử lý','All clear — nothing needs attention.':'Mọi thứ ổn — không có việc cần xử lý.',
    'Pending verify':'Chờ duyệt','Temp alerts today':'Cảnh báo nhiệt độ hôm nay','Overdue checklists':'Checklist quá hạn',
    // ---- staff home ----
    'My Store':'Cửa hàng của tôi','What do you need to do?':'Bạn cần làm gì?','Recent at your store':'Gần đây tại cửa hàng',
    'Store Checklist':'Checklist cửa hàng','Bin Checklist':'Checklist thùng rác','Log Delivery':'Ghi giao hàng',
    'Store Rules':'Nội quy cửa hàng','Supermarket Rules':'Nội quy siêu thị','open items':'mục đang mở',
    'Opening & closing checks':'Kiểm tra mở & đóng ca','Bin Admin':'Quản lý thùng rác','Violation':'Vi phạm',
    // ---- manager panel / verify ----
    'Verify':'Xác nhận','Submitted':'Đã nộp','Manager assessment note':'Ghi chú đánh giá của quản lý',
    'done':'hoàn tất','outstanding':'còn lại','Checklist History':'Lịch sử checklist','Bin':'Thùng rác',
    // ---- gallery / filters ----
    'All stores':'Tất cả cửa hàng','All departments':'Tất cả bộ phận','All sections':'Tất cả khu vực','All dates':'Tất cả ngày',
    'Photos shown':'Ảnh hiển thị','Checklist photos':'Ảnh checklist','Report photos':'Ảnh báo cáo',
    // ---- email ----
    'From name':'Tên người gửi','Store admin name':'Tên quản trị cửa hàng','Store admin email':'Email quản trị cửa hàng',
    // ---- data management ----
    'Records & storage':'Bản ghi & dung lượng','Delete in date range':'Xóa theo khoảng ngày',
    'Submitted checklists':'Checklist đã nộp','Operational records':'Bản ghi vận hành','From':'Từ','To':'Đến',
    'Export data, run backups and clean up old records.':'Xuất dữ liệu, sao lưu và dọn dẹp bản ghi cũ.',
    // ---- common ----
    'Total staff':'Tổng nhân viên','Active':'Đang làm','Roles':'Vai trò','Edit':'Sửa','Reset':'Đặt lại',
    'Loading data...':'Đang tải dữ liệu...','No recent activity at your store yet.':'Chưa có hoạt động gần đây tại cửa hàng.',
  };

  var LANG = 'en';
  try{ LANG = localStorage.getItem('mcq_lang') || 'en'; }catch(e){}

  function tnode(node){
    var p = node.parentNode; if(!p) return; var tag = p.nodeName;
    if(tag==='SCRIPT'||tag==='STYLE'||tag==='TEXTAREA'||tag==='OPTION'&&false) return;
    var raw = node.nodeValue; if(!raw || !raw.trim()) return;
    var key = raw.replace(/ /g,' ').replace(/\s+/g,' ').trim();
    var tr = DICT[key];
    if(tr && tr!==key){ var lead=raw.match(/^\s*/)[0], trail=raw.match(/\s*$/)[0]; node.nodeValue = lead+tr+trail; }
  }
  function apply(){
    if(LANG!=='vi') return;
    try{
      var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
      var batch=[], n; while(n=w.nextNode()) batch.push(n);
      batch.forEach(tnode);
      document.querySelectorAll('input[placeholder],textarea[placeholder]').forEach(function(el){ var k=el.getAttribute('placeholder'); if(k&&DICT[k]) el.setAttribute('placeholder',DICT[k]); });
    }catch(e){}
  }

  function safe(fn){ try{ fn && fn(); }catch(e){} }
  function loggedIn(){ try{ return !!(State && State.account); }catch(e){ return false; } }
  window.mcqSetLang = function(l){
    try{ localStorage.setItem('mcq_lang', l); }catch(e){}
    LANG = l;
    var b = document.getElementById('mcq-lang-btn'); if(b) b.textContent = (l==='vi'?'EN':'VI');
    if(loggedIn()){ safe(window.render); safe(window.buildSidebar); safe(window.buildTopbar); }
    else if(window.showLogin){ var lr=document.getElementById('login-root'); if(lr && lr.style.display!=='none') safe(function(){ showLogin(); }); }
    apply();
  };

  // catch-all: re-translate after any DOM render (debounced; childList only → our text edits don't loop)
  var pending=false;
  try{
    new MutationObserver(function(){ if(LANG!=='vi'||pending) return; pending=true; setTimeout(function(){ pending=false; apply(); },45); })
      .observe(document.body, {childList:true, subtree:true});
  }catch(e){}

  // floating language toggle
  function addToggle(){
    if(document.getElementById('mcq-lang-btn')) return;
    var btn=document.createElement('button'); btn.id='mcq-lang-btn'; btn.textContent=(LANG==='vi'?'EN':'VI'); btn.title='Language · Ngôn ngữ';
    btn.style.cssText='position:fixed;left:16px;bottom:16px;z-index:150;border:0;border-radius:24px;min-width:46px;height:46px;padding:0 14px;font-weight:800;font-family:inherit;font-size:14px;color:#fff;background:linear-gradient(135deg,#6a1b9a,#0891b2);box-shadow:0 8px 20px rgba(106,27,154,.38);cursor:pointer';
    btn.onclick=function(){ mcqSetLang(LANG==='vi'?'en':'vi'); };
    document.body.appendChild(btn);
  }
  if(document.readyState!=='loading') addToggle(); else document.addEventListener('DOMContentLoaded', addToggle);
  setTimeout(apply, 400); setTimeout(apply, 1200);   // translate the initial boot render
})();
