import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";
  import { getFirestore, collection, addDoc, getDocs, query, where, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
  import { GeoPoint } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";
  import { getMessaging, getToken, onMessage } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-messaging.js";

  const firebaseConfig = {
    apiKey: "AIzaSyDfIBS2gB4lkRZ1_ZerLk451EVfafrfWSM",
    authDomain: "qtratamal.firebaseapp.com",
    projectId: "qtratamal",
    storageBucket: "qtratamal.appspot.com",
    messagingSenderId: "491056452067",
    appId: "1:491056452067:web:0c8ef019a651cd47c290d6"
  };
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const messaging = getMessaging(app);

  let currentDonorDocId = null;
  let currentDisplayedDonors = [];
  let isProcessing = false;
  const pendingOperations = new Set();
  let map;
  let markers = [];
  let userPosition = null;
  let locationPermissionAsked = false;
  let mapInitialized = false;
  let locationPickerMap;
  let locationMarker;
  let editLocationPickerMap;
  let editLocationMarker;

  // كلمة المرور المشفرة
  const PASSWORD_HASH = "8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918";

  // وظائف مساعدة
  function showLoading() {
    document.getElementById('loadingIndicator').style.display = 'block';
  }

  function hideLoading() {
    document.getElementById('loadingIndicator').style.display = 'none';
  }

  function disableButtons() {
    document.querySelectorAll('button').forEach(btn => {
      btn.disabled = true;
    });
  }

  function enableButtons() {
    document.querySelectorAll('button').forEach(btn => {
      btn.disabled = false;
    });
  }

  function showMessage(msg, type = 'success') {
    const popup = type === 'success' ? document.getElementById('successPopup') : document.getElementById('errorPopup');
    const messageElement = type === 'success' ? document.getElementById('successMessage') : document.getElementById('errorMessage');
    
    messageElement.textContent = msg;
    popup.classList.add('active'); 
    setTimeout(() => popup.classList.remove('active'), 3000);
  }

  function formatDate(dateString) {
    if (!dateString) return '—';
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }

  function normalizeArabic(text) {
    return text
      .toLowerCase()
      .trim()
      .replace(/[\u064B-\u065F]/g, '')
      .replace(/[\u0622\u0623\u0625]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .replace(/\s+/g, ' ');
  }

  // دالة لتهيئة خريطة تحديد الموقع
  function initLocationPickerMap() {
    locationPickerMap = new google.maps.Map(document.getElementById('locationPickerMap'), {
      center: {lat: 15.3694, lng: 44.1910}, // مركز افتراضي (صنعاء)
      zoom: 12
    });

    // إضافة علامة قابلة للسحب
    locationMarker = new google.maps.Marker({
      position: {lat: 15.3694, lng: 44.1910},
      map: locationPickerMap,
      draggable: true,
      title: "اسحب العلامة لتحديد موقعك الدقيق"
    });

    // تحديث الإحداثيات عند تحريك العلامة
    locationMarker.addListener('dragend', function() {
      const position = locationMarker.getPosition();
      document.getElementById('donorLatitude').value = position.lat();
      document.getElementById('donorLongitude').value = position.lng();
    });

    // إمكانية النقر على الخريطة لتحديد الموقع
    locationPickerMap.addListener('click', function(e) {
      locationMarker.setPosition(e.latLng);
      document.getElementById('donorLatitude').value = e.latLng.lat();
      document.getElementById('donorLongitude').value = e.latLng.lng();
    });
  }

  // دالة لتهيئة خريطة تحديد الموقع في قسم التعديل
  function initEditLocationPickerMap(lat, lng) {
    editLocationPickerMap = new google.maps.Map(document.getElementById('editLocationPickerMap'), {
      center: {lat: lat || 15.3694, lng: lng || 44.1910},
      zoom: 12
    });

    // إضافة علامة قابلة للسحب
    editLocationMarker = new google.maps.Marker({
      position: {lat: lat || 15.3694, lng: lng || 44.1910},
      map: editLocationPickerMap,
      draggable: true,
      title: "اسحب العلامة لتحديد موقعك الدقيق"
    });

    // تحديث الإحداثيات عند تحريك العلامة
    editLocationMarker.addListener('dragend', function() {
      const position = editLocationMarker.getPosition();
      document.getElementById('editDonorLatitude').value = position.lat();
      document.getElementById('editDonorLongitude').value = position.lng();
    });

    // إمكانية النقر على الخريطة لتحديد الموقع
    editLocationPickerMap.addListener('click', function(e) {
      editLocationMarker.setPosition(e.latLng);
      document.getElementById('editDonorLatitude').value = e.latLng.lat();
      document.getElementById('editDonorLongitude').value = e.latLng.lng();
    });
  }

  // دالة لتهيئة الخريطة الرئيسية
  function initMap() {
    const mapDiv = document.getElementById('donorsMap');
    if (!mapDiv || mapDiv.style.display === 'none') return;
    
    if (!mapInitialized && typeof google !== 'undefined') {
      map = new google.maps.Map(mapDiv, {
        center: {lat: 15.3694, lng: 44.1910}, // إحداثيات صنعاء
        zoom: 12
      });
      
      mapInitialized = true;
      
      // طلب إذن الموقع عند تحميل الصفحة
      if (!locationPermissionAsked) {
        requestLocationPermission();
      }
    }
  }

  // دالة لطلب إذن الموقع
  function requestLocationPermission() {
    locationPermissionAsked = true;
    const permissionDiv = document.getElementById('locationPermission');
    
    // إظهار نافذة طلب الإذن فقط إذا لم يتم منح الإذن مسبقًا
    if (navigator.permissions) {
      navigator.permissions.query({name: 'geolocation'}).then(permissionStatus => {
        if (permissionStatus.state !== 'granted') {
          permissionDiv.style.display = 'block';
        }
      });
    } else {
      permissionDiv.style.display = 'block';
    }
  }

  // دالة لعرض المتبرعين على الخريطة
  async function displayDonorsOnMap(donors) {
    if (!mapInitialized || !map) {
      initMap();
      return;
    }
    
    // مسح العلامات القديمة أولاً
    clearMapMarkers();
    
    // إضافة علامة للمستخدم إذا كان لدينا موقعه
    if (userPosition) {
      new google.maps.Marker({
        position: userPosition,
        map: map,
        title: 'موقعك الحالي',
        icon: {
          url: 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png'
        }
      });
    }
    
    const bounds = new google.maps.LatLngBounds();
    
    // إضافة علامات للمتبرعين
    for (const donor of donors) {
      let donorLocation;
      
      if (donor.coordinates) {
        donorLocation = {
          lat: donor.coordinates.latitude,
          lng: donor.coordinates.longitude
        };
      } else {
        // للمتبرعين القدامى الذين لا يوجد لديهم إحداثيات
        donorLocation = {lat: 15.3694, lng: 44.1910}; // افتراضي لصنعاء
      }
      
      bounds.extend(donorLocation);
      
      const marker = new google.maps.Marker({
        position: donorLocation,
        map: map,
        title: donor.name,
        icon: {
          url: 'http://maps.google.com/mapfiles/ms/icons/red-dot.png'
        }
      });
      
      markers.push(marker);
      
      // إضافة معلومات عند النقر على العلامة
      const infoWindow = new google.maps.InfoWindow({
        content: `
          <div style="direction: rtl; text-align: right;">
            <h3 style="margin: 0; color: #b30000;">${donor.name}</h3>
            <p><strong>فصيلة الدم:</strong> ${donor.blood}</p>
            <p><strong>الهاتف:</strong> ${donor.phone}</p>
            ${donor.whatsapp ? `<p><strong>واتساب:</strong> ${donor.whatsapp}</p>` : ''}
            <p><strong>المحافظة:</strong> ${donor.city}</p>
            <p><strong>المديرية:</strong> ${donor.area}</p>
            <a href="tel:${donor.phone}" style="color: white; background: #2e7d32; padding: 5px 10px; border-radius: 5px; text-decoration: none;">
              <i class="fas fa-phone"></i> اتصل الآن
            </a>
          </div>
        `
      });
      
      marker.addListener('click', () => {
        infoWindow.open(map, marker);
      });
    }
    
    if (donors.length > 0) {
      if (userPosition) {
        bounds.extend(userPosition);
      }
      map.fitBounds(bounds);
    }
  }

  // دالة لمسح العلامات من الخريطة
  function clearMapMarkers() {
    markers.forEach(marker => marker.setMap(null));
    markers = [];
  }

  // دالة للحصول على الموقع الحالي
  function getCurrentLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject('متصفحك لا يدعم تحديد الموقع');
        return;
      }
      
      navigator.geolocation.getCurrentPosition(
        position => {
          userPosition = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          resolve(userPosition);
        },
        error => {
          let errorMessage = 'تعذر الحصول على موقعك';
          switch(error.code) {
            case error.PERMISSION_DENIED:
              errorMessage = 'تم رفض طلب الوصول إلى الموقع';
              break;
            case error.POSITION_UNAVAILABLE:
              errorMessage = 'معلومات الموقع غير متوفرة';
              break;
            case error.TIMEOUT:
              errorMessage = 'انتهى وقت طلب الموقع';
              break;
          }
          reject(errorMessage);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  }

  async function addDonor() {
    if (isProcessing) return;
    
    const donorName = document.getElementById('donorName').value.trim();
    const nameParts = donorName.split(/\s+/);
    const donorPhone = document.getElementById('donorPhone').value.trim();
    const btn = document.getElementById('btn-add-donor');
    
    // التحقق من التكرار المحلي أولاً
    if (pendingOperations.has(donorPhone)) {
      showMessage('جاري معالجة هذا المتبرع، يرجى الانتظار...', 'error');
      return;
    }

    if (nameParts.length < 2 || nameParts.length > 4) {
      showMessage("الاسم يجب أن يتكون من أسمين إلى أربعة أسماء فقط.", 'error');
      return;
    }
    
    const phoneRegex = /^[0-9]{9}$/;
    if (!phoneRegex.test(donorPhone)) {
      showMessage('رقم الهاتف يجب أن يتكون من 9 أرقام فقط', 'error');
      return;
    }
    
    const donorWhatsapp = document.getElementById('donorWhatsapp').value.trim();
    if (donorWhatsapp) {
      const whatsappRegex = /^967\d{9}$/;
      if (!whatsappRegex.test(donorWhatsapp)) {
        showMessage('رقم الواتساب يجب أن يبدأ بـ 967 ويتكون من 12 رقماً مثال: 967712345678', 'error');
        return;
      }
    }

    // التحقق من وجود إحداثيات
    const lat = document.getElementById('donorLatitude').value;
    const lng = document.getElementById('donorLongitude').value;
    
    if (!lat || !lng) {
      showMessage('اضفط على استخدام موقعي الحالي ليسهل البحث عن أقرب متبرع للمحتاج عن الدم', 'error');
      return;
    }

    try {
      isProcessing = true;
      pendingOperations.add(donorPhone);
      btn.disabled = true;
      showLoading();
      
      // التحقق من التكرار على السيرفر
      const phoneSnap = await getDocs(query(collection(db, 'donors'), where('phone', '==', donorPhone)));
      
      if (!phoneSnap.empty) {
        showMessage('رقم الهاتف مسجل بالفعل', 'error');
        return;
      }
      
      const city = document.getElementById('donorCity').value.trim();
      const area = document.getElementById('donorArea').value.trim();
      
      const d = {
        name: donorName,
        phone: donorPhone,
        city: city,
        area: area,
        location: document.getElementById('donorLocation').value.trim(),
        lastDate: document.getElementById('donorLastDate').value || null,
        whatsapp: donorWhatsapp || null,
        blood: document.getElementById('donorBlood').value,
        coordinates: new GeoPoint(parseFloat(lat), parseFloat(lng)),
        createdAt: new Date().toISOString()
      };
      
      if (!d.name || !d.phone || !d.city || !d.area || !d.blood) { 
        showMessage('يرجى تعبئة جميع الحقول الأساسية', 'error'); 
        return; 
      }

      await addDoc(collection(db, 'donors'), d);
      showMessage('تم تسجيل بياناتك بنجاح جزاك الله خير');
      document.querySelectorAll('#register input').forEach(i => i.value = '');
      document.getElementById('donorBlood').selectedIndex = 0;
      locationMarker.setPosition({lat: 15.3694, lng: 44.1910}); // إعادة العلامة للموقع الافتراضي
      document.getElementById('donorLatitude').value = '';
      document.getElementById('donorLongitude').value = '';
    } catch (e) {
      console.error(e);
      showMessage('حدث خطأ أثناء التسجيل', 'error');
    } finally {
      isProcessing = false;
      pendingOperations.delete(donorPhone);
      btn.disabled = false;
      hideLoading();
    }
  }

  async function searchDonorToEdit() {
    if (isProcessing) return;
    
    const input = document.getElementById('editSearchInput').value.trim();
    const btn = document.getElementById('btn-search-donor-edit');
    
    if (!input) { 
      showMessage('الرجاء إدخال الاسم أو رقم الهاتف', 'error'); 
      return; 
    }
    
    try {
      isProcessing = true;
      btn.disabled = true;
      showLoading();
      
      const snap = await getDocs(collection(db, 'donors'));
      const all = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const normInput = normalizeArabic(input);
      const found = all.find(d => {
        const normName = normalizeArabic(d.name || '');
        const normPhone = normalizeArabic(d.phone || '');
        return normName === normInput || normPhone === normInput;
      });
      
      if (found) {
        currentDonorDocId = found.id;
        document.getElementById('editingDonorId').textContent = found.id;
        document.getElementById('editSection').style.display = 'block';
        document.getElementById('editNewName').value = found.name;
        document.getElementById('editPhone').value = found.phone;
        document.getElementById('editWhatsapp').value = found.whatsapp || '';
        document.getElementById('editCity').value = found.city;
        document.getElementById('editArea').value = found.area;
        document.getElementById('editLocation').value = found.location || '';
        document.getElementById('editLastDate').value = found.lastDate || '';
        document.getElementById('editBlood').value = found.blood;
        
        // تهيئة خريطة التعديل بالإحداثيات الحالية
        const lat = found.coordinates?.latitude || 15.3694;
        const lng = found.coordinates?.longitude || 44.1910;
        initEditLocationPickerMap(lat, lng);
        document.getElementById('editDonorLatitude').value = lat;
        document.getElementById('editDonorLongitude').value = lng;
      } else {
        showMessage('المتبرع غير موجود', 'error');
      }
    } catch (e) { 
      console.error(e); 
      showMessage('خطأ أثناء البحث', 'error'); 
    } finally {
      isProcessing = false;
      btn.disabled = false;
      hideLoading();
    }
  }

  async function saveEdit() {
    if (isProcessing || !currentDonorDocId) return;
    
    const btn = document.getElementById('btn-save-edit');
    const city = document.getElementById('editCity').value.trim();
    const area = document.getElementById('editArea').value.trim();
    
    // التحقق من وجود إحداثيات
    const lat = document.getElementById('editDonorLatitude').value;
    const lng = document.getElementById('editDonorLongitude').value;
    
    if (!lat || !lng) {
      showMessage('الرجاء تحديد موقعك على الخريطة', 'error');
      return;
    }

    try {
      isProcessing = true;
      btn.disabled = true;
      showLoading();
      
      const updated = {
        name: document.getElementById('editNewName').value.trim(),
        phone: document.getElementById('editPhone').value.trim(),
        city: city,
        area: area,
        location: document.getElementById('editLocation').value.trim(),
        lastDate: document.getElementById('editLastDate').value || null,
        whatsapp: document.getElementById('editWhatsapp').value.trim() || null,
        blood: document.getElementById('editBlood').value,
        coordinates: new GeoPoint(parseFloat(lat), parseFloat(lng)),
        updatedAt: new Date().toISOString()
      };
      
      if (updated.whatsapp) {
        const whatsappRegex = /^967\d{9}$/;
        if (!whatsappRegex.test(updated.whatsapp)) {
          showMessage('رقم الواتساب يجب أن يبدأ بـ 967 ويتكون من 12 رقماً مثال: 967712345678', 'error');
          return;
        }
      }
      
      // التحقق من التكرار في الأسماء
      const nameSnap = await getDocs(query(collection(db, 'donors'), where('name', '==', updated.name)));
      if (!nameSnap.empty && nameSnap.docs.some(doc => doc.id !== currentDonorDocId)) { 
        showMessage('هذا الاسم مسجل لمتبرع آخر', 'error'); 
        return; 
      }
      
      // التحقق من التكرار في أرقام الهاتف
      const phoneSnap = await getDocs(query(collection(db, 'donors'), where('phone', '==', updated.phone)));
      if (!phoneSnap.empty && phoneSnap.docs.some(doc => doc.id !== currentDonorDocId)) { 
        showMessage('رقم الهاتف مسجل لمتبرع آخر', 'error'); 
        return; 
      }
      
      await updateDoc(doc(db, 'donors', currentDonorDocId), updated);
      showMessage('تم التعديل بنجاح');
      document.getElementById('editSection').style.display = 'none'; 
      currentDonorDocId = null;
    } catch (e) { 
      console.error(e); 
      showMessage('خطأ أثناء الحفظ', 'error'); 
    } finally {
      isProcessing = false;
      btn.disabled = false;
      hideLoading();
    }
  }

  async function deleteDonor() { 
    if (isProcessing || !currentDonorDocId) return;
    if (!confirm('هل أنت متأكد من حذف هذا المتبرع؟')) return;
    
    const btn = document.getElementById('btn-delete-donor');
    
    try {
      isProcessing = true;
      btn.disabled = true;
      showLoading();
      
      await deleteDoc(doc(db, 'donors', currentDonorDocId)); 
      showMessage('تم حذف المتبرع بنجاح');
      document.getElementById('editSection').style.display = 'none'; 
      currentDonorDocId = null;
    } catch (e) {
      console.error(e);
      showMessage('حدث خطأ أثناء الحذف', 'error');
    } finally {
      isProcessing = false;
      btn.disabled = false;
      hideLoading();
    }
  }

  function cancelEdit() { 
    document.getElementById('editSection').style.display = 'none'; 
    currentDonorDocId = null; 
  }

  function renderSearchTable(donors) {
    const tbody = document.getElementById('donorsTable'); 
    tbody.innerHTML = '';
    
    if (!donors.length) { 
      tbody.innerHTML = '<tr><td colspan="10">لا يوجد متبرعون</td></tr>'; 
      document.getElementById('donorCount').innerHTML = '<i class="fas fa-users"></i> عدد المتبرعين: 0'; 
      currentDisplayedDonors = []; 
      return; 
    }
    
    currentDisplayedDonors = donors; 
    document.getElementById('donorCount').innerHTML = `<i class="fas fa-users"></i> عدد المتبرعين: ${donors.length}`;
    
    donors.forEach(d => {
      const row = tbody.insertRow();
      row.innerHTML = `
        <td data-label="الاسم">${d.name}</td>
        <td data-label="الهاتف">
          <div style="display:flex;flex-direction:column;align-items:center;gap:5px;">
            <a href="tel:${d.phone}" style="color:white;background-color:#1b5e20;padding:5px 10px;border-radius:8px;display:inline-flex;align-items:center;gap:6px;text-decoration:none;font-weight:bold;font-size:12px;white-space:nowrap;">
              <i class="fas fa-phone"></i>
              اضغط للإتصال
            </a>
           <span style="color:#b30000;font-weight:bold;direction:ltr;text-align:right;font-family:monospace;font-size:18px;">${d.phone}</span>
          </div>
        </td> 
        <td data-label="الفصيلة">${d.blood}</td>
        <td data-label="المحافظة">${d.city}</td>
        <td data-label="المديرية">${d.area}</td>
        <td data-label="السكن">${d.location || '—'}</td>
        <td data-label="الواتساب">
          ${d.whatsapp
            ? `<a href="https://wa.me/${d.whatsapp}" target="_blank"
                  style="color:green; text-decoration:none; font-weight:bold;
                         display:flex; flex-direction:column; align-items:center;
                         font-size: 0.95em;">
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <i class="fab fa-whatsapp" style="font-size:1.2em;"></i>
                    <span>${d.whatsapp}</span>
                  </div>
                  <small style="color:#006400; font-weight:normal; margin-top:5px; font-size:13px;">
                    اضغط للتواصل واتساب مباشرة
                  </small>
               </a>`
            : "—"
          }
        </td>
        <td data-label="آخر تبرع">${d.lastDate ? formatDate(d.lastDate) : '—'}</td>
        <td data-label="المسافة">${d.distance ? `<i class="fas fa-location-arrow"></i> ${d.distance}` : '—'}</td>
        <td data-label="تعديل">
          <button data-donor-id="${d.id}" class="btn-update-date">
            <i class="fas fa-edit"></i> تحديث تاريخ التبرع
          </button>
        </td>
      `;
    });
    
    document.querySelectorAll('.btn-update-date').forEach(btn => {
      btn.addEventListener('click', () => enableEditDate(btn.getAttribute('data-donor-id')));
    });
    
    // عرض المتبرعين على الخريطة إذا كانت الخريطة ظاهرة
    if (document.getElementById('donorsMap').style.display !== 'none') {
      displayDonorsOnMap(donors);
    }
  }

  async function searchDonors() {
    if (isProcessing) return;
    
    const blood = document.getElementById('searchBlood').value;
    const text = normalizeArabic(document.getElementById('searchQuery').value);
    
    try {
      isProcessing = true;
      showLoading();
      
      let q = collection(db, 'donors');
      if (blood) q = query(q, where('blood', '==', blood));
      
      const snap = await getDocs(q);
      let donors = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      // تطبيق البحث النصي
      if (text) {
        donors = donors.filter(d => {
          const fields = [d.name, d.phone, d.city, d.area, d.location].map(f => normalizeArabic(f || ''));
          return fields.some(f => f.includes(text));
        });
      }
      
      renderSearchTable(donors);
    } catch (e) {
      console.error(e);
      showMessage('حدث خطأ أثناء البحث', 'error');
    } finally {
      isProcessing = false;
      hideLoading();
    }
  }

  async function searchNearbyDonors() {
    try {
      showLoading();
      
      // الحصول على الموقع الحالي
      const position = await getCurrentLocation();
      
      const snap = await getDocs(collection(db, 'donors'));
      const allDonors = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      // حساب المسافة لكل متبرع
      const donorsWithDistance = allDonors.map(donor => {
        let distance = '—';
        
        if (donor.coordinates) {
          const donorPos = {
            lat: donor.coordinates.latitude,
            lng: donor.coordinates.longitude
          };
          distance = calculateDistance(position, donorPos);
        }
        
        return {
          ...donor,
          distance: distance
        };
      });
      
      // تصفية المتبرعين القريبين (على سبيل المثال ضمن 50 كم)
      const nearbyDonors = donorsWithDistance.filter(donor => {
        return donor.distance !== '—' && parseFloat(donor.distance) < 50;
      });
      
      renderSearchTable(nearbyDonors.length > 0 ? nearbyDonors : donorsWithDistance);
      showMessage(nearbyDonors.length > 0 
        ? `تم العثور على ${nearbyDonors.length} متبرع قريب منك` 
        : 'لا يوجد متبرعون قريبون، عرض جميع المتبرعين');
      
    } catch (error) {
      console.error('Error getting nearby donors:', error);
      showMessage(error, 'error');
    } finally {
      hideLoading();
    }
  }

  // دالة لحساب المسافة بين موقعين
  function calculateDistance(pos1, pos2) {
    const R = 6371; // نصف قطر الأرض بالكيلومتر
    const dLat = (pos2.lat - pos1.lat) * Math.PI / 180;
    const dLon = (pos2.lng - pos1.lng) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(pos1.lat * Math.PI / 180) * 
      Math.cos(pos2.lat * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return (R * c).toFixed(1) + ' كم';
  }

  function enableEditDate(id) { 
    currentDonorDocId = id; 
    document.getElementById('updateDatePopup').classList.add('active'); 
    document.getElementById('newDonationDate').value = ''; 
  }

  async function saveDonationDate() {
    if (isProcessing) return;
    
    const newDate = document.getElementById('newDonationDate').value;
    const btn = document.getElementById('btn-save-donation-date');
    
    if (!newDate) { 
      showMessage('يرجى إدخال تاريخ التبرع', 'error'); 
      return; 
    }
    
    try { 
      isProcessing = true;
      btn.disabled = true;
      showLoading();
      
      await updateDoc(doc(db, 'donors', currentDonorDocId), { 
        lastDate: newDate,
        updatedAt: new Date().toISOString()
      }); 
      
      showMessage('تم تحديث بيانات المتبرع بنجاح');
      
      // تحديث الجدول مباشرة
      const donorIndex = currentDisplayedDonors.findIndex(d => d.id === currentDonorDocId);
      if (donorIndex !== -1) {
        currentDisplayedDonors[donorIndex].lastDate = newDate;
        renderSearchTable(currentDisplayedDonors);
      }
      
      closeUpdateDatePopup(); 
      currentDonorDocId = null; 
    } catch(e) { 
      console.error('Error updating donor data:', e); 
      showMessage('حدث خطأ أثناء التحديث', 'error'); 
    } finally {
      isProcessing = false;
      btn.disabled = false;
      hideLoading();
    }
  }

  function closeUpdateDatePopup() { 
    document.getElementById('updateDatePopup').classList.remove('active'); 
    currentDonorDocId = null; 
  }

  function showPasswordPopup() { 
    document.getElementById('passwordPopup').classList.add('active'); 
    document.getElementById('passwordInput').value = ''; 
    document.getElementById('passwordError').style.display = 'none';
  }

  function closePasswordPopup() { 
    document.getElementById('passwordPopup').classList.remove('active'); 
    document.getElementById('passwordError').style.display = 'none';
  }

  function showEmergencyPopup() {
    document.getElementById('emergencyPopup').style.display = 'block';
  }

  function closeEmergencyPopup() {
    document.getElementById('emergencyPopup').style.display = 'none';
  }

  function showNotifications() {
    document.getElementById('notificationsPopup').classList.add('active');
  }

  function closeNotifications() {
    document.getElementById('notificationsPopup').classList.remove('active');
  }

  async function checkPassword() { 
    const inputPassword = document.getElementById('passwordInput').value;
    const errorElement = document.getElementById('passwordError');
    
    if (!inputPassword) {
      errorElement.textContent = 'يرجى إدخال كلمة المرور';
      errorElement.style.display = 'block';
      return;
    }
    
    // حساب التجزئة SHA-256 لكلمة المرور المدخلة
    const hashedInput = CryptoJS.SHA256(inputPassword).toString();
    
    if (hashedInput === PASSWORD_HASH) { 
      closePasswordPopup(); 
      showSection('edit'); 
      errorElement.style.display = 'none';
    } else {
      errorElement.textContent = 'كلمة المرور غير صحيحة';
      errorElement.style.display = 'block';
    }
  }

  function showSection(id) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    
    // إظهار/إخفاء عناصر التصفح حسب القسم النشط
    const nav = document.querySelector('nav');
    const header = document.querySelector('header');
    const infoP = document.querySelector('header + p');
    
    if (id === 'welcome') {
      nav.style.display = 'none';
      header.style.display = 'none';
      infoP.style.display = 'none';
    } else {
      nav.style.display = 'flex';
      header.style.display = 'block';
      infoP.style.display = 'block';
      
      if (id === 'search') {
        searchDonors();
      }
      if (id === 'register') {
        document.querySelectorAll('#register input').forEach(i => i.value = '');
        document.getElementById('donorBlood').selectedIndex = 0;
      }
      if (id === 'edit') {
        document.getElementById('editSection').style.display = 'none';
        document.getElementById('editSearchInput').value = '';
        currentDonorDocId = null;
        document.getElementById('editingDonorId').textContent = '';
      }
    }
  }

  // دالة للتحقق من المتبرع الحالي وتحديث موقعه
  async function checkAndUpdateCurrentDonor() {
    try {
      // الحصول على الموقع الحالي
      const position = await getCurrentLocation();
      
      // البحث عن المتبرع الحالي باستخدام رقم الهاتف
      const phone = prompt('الرجاء إدخال رقم هاتفك المسجل في التطبيق للتحقق من هويتك:');
      if (!phone) return;
      
      const phoneSnap = await getDocs(query(collection(db, 'donors'), where('phone', '==', phone)));
      
      if (phoneSnap.empty) {
        showMessage('رقم الهاتف غير مسجل في التطبيق', 'error');
        return;
      }
      
      const donorDoc = phoneSnap.docs[0];
      const donorData = donorDoc.data();
      
      // تحديث موقع المتبرع
      await updateDoc(doc(db, 'donors', donorDoc.id), {
        coordinates: new GeoPoint(position.lat, position.lng),
        updatedAt: new Date().toISOString()
      });
      
      showMessage('تم تحديث موقعك بنجاح. شكراً لك على مساهمتك في إنقاذ الأرواح!');
      
    } catch (error) {
      console.error('Error updating donor location:', error);
      showMessage('حدث خطأ أثناء تحديث الموقع', 'error');
    }
  }

  // دالة لإرسال إشعارات الطوارئ
  async function sendEmergencyRequest() {
    const bloodType = document.getElementById('emergencyBloodType').value;
    const city = document.getElementById('emergencyCity').value.trim();
    const area = document.getElementById('emergencyArea').value.trim();
    const message = document.getElementById('emergencyMessage').value.trim();
    
    if (!bloodType) {
      showMessage('الرجاء تحديد فصيلة الدم المطلوبة', 'error');
      return;
    }
    
    if (!city || !area) {
      showMessage('الرجاء تحديد المحافظة والمديرية', 'error');
      return;
    }
    
    try {
      showLoading();
      
      // إعداد بيانات الطلب الطارئ
      const emergencyRequest = {
        bloodType,
        city,
        area,
        message: message || 'حالة طارئة تحتاج إلى تبرع بالدم',
        timestamp: new Date().toISOString(),
        status: 'pending'
      };
      
      // حفظ الطلب في قاعدة البيانات
      const docRef = await addDoc(collection(db, 'emergencyRequests'), emergencyRequest);
      
      // البحث عن المتبرعين المناسبين
      const q = query(
        collection(db, 'donors'),
        where('blood', '==', bloodType),
        where('city', '==', city),
        where('area', '==', area)
      );
      
      const querySnapshot = await getDocs(q);
      const donors = querySnapshot.docs.map(doc => doc.data());
      
      if (donors.length === 0) {
        showMessage('لا يوجد متبرعون مسجلون في منطقتك بنفس فصيلة الدم المطلوبة', 'error');
        return;
      }
      
      // إعداد بيانات الإشعار
      const notification = {
        title: 'طلب تبرع طارئ',
        body: `مطلوب متبرع بفصيلة ${bloodType} في ${city} - ${area}`,
        icon: 'https://example.com/blood-drop.png',
        click_action: 'https://example.com/emergency'
      };
      
      // إرسال الإشعارات للمتبرعين
      for (const donor of donors) {
        if (donor.notificationToken) {
          try {
            const response = await fetch('https://fcm.googleapis.com/v1/projects/qtratamal/messages:send', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + await getAccessToken()
              },
              body: JSON.stringify({
                message: {
                  token: donor.notificationToken,
                  notification: notification,
                  data: {
                    emergencyId: docRef.id,
                    bloodType: bloodType,
                    city: city,
                    area: area
                  }
                }
              })
            });
            
            if (!response.ok) {
              console.error('Failed to send notification to donor:', donor.phone);
            }
          } catch (error) {
            console.error('Error sending notification:', error);
          }
        }
      }
      
      // إضافة الإشعار إلى قائمة الإشعارات المحلية
      const notificationItem = document.createElement('div');
      notificationItem.className = 'notification-item';
      notificationItem.innerHTML = `
        <p>تم إرسال طلب تبرع طارئ لفصيلة ${bloodType} في ${city} - ${area}</p>
        ${message ? `<p>${message}</p>` : ''}
        <div class="notification-time">الآن</div>
      `;
      
      document.getElementById('notificationsList').prepend(notificationItem);
      
      showMessage('تم إرسال طلب التبرع الطارئ بنجاح');
      closeEmergencyPopup();
      
    } catch (error) {
      console.error('Error sending emergency request:', error);
      showMessage('حدث خطأ أثناء إرسال الطلب', 'error');
    } finally {
      hideLoading();
    }
  }

  // دالة للحصول على رمز وصول Firebase
  async function getAccessToken() {
    // في تطبيق حقيقي، يجب استبدال هذا بآلية آمنة للحصول على رمز الوصول
    // هذا مثال مبسط فقط لأغراض العرض
    return 'YOUR_FIREBASE_ACCESS_TOKEN';
  }

  // دالة لتهيئة إشعارات Firebase
  async function initializeFirebaseMessaging() {
    try {
      // طلب إذن الإشعارات
      const permission = await Notification.requestPermission();
      
      if (permission === 'granted') {
        console.log('Notification permission granted.');
        
        // الحصول على رمز الجهاز
        const token = await getToken(messaging, {
          vapidKey: 'BL_RSy08zoTm4ShAVn5xlGj6Q9jdykvhuMTBICVs010LybRd9CF-vf9uDPkwu_8LN67j3hqt7X7m87iAlbO3Qs0'
        });
        
        if (token) {
          console.log('FCM Token:', token);
          
          // يمكنك هنا إرسال الرمز إلى خادمك لتخزينه
          // await saveTokenToDatabase(token);
          
          // الاستماع للإشعارات الواردة
          onMessage(messaging, (payload) => {
            console.log('Message received:', payload);
            
            // عرض الإشعار
            const notificationTitle = payload.notification?.title || 'إشعار جديد';
            const notificationOptions = {
              body: payload.notification?.body || 'لديك إشعار جديد من تطبيق قطرة أمل',
              icon: '/images/logo.png'
            };
            
            // إضافة الإشعار إلى قائمة الإشعارات المحلية
            const notificationItem = document.createElement('div');
            notificationItem.className = 'notification-item';
            notificationItem.innerHTML = `
              <p>${payload.notification?.body || 'إشعار جديد'}</p>
              <div class="notification-time">الآن</div>
            `;
            
            document.getElementById('notificationsList').prepend(notificationItem);
            
            // عرض الإشعار كرسالة منبثقة
            if (Notification.permission === 'granted') {
              new Notification(notificationTitle, notificationOptions);
            } else {
              showMessage(payload.notification?.body || 'لديك إشعار جديد', 'success');
            }
          });
        } else {
          console.log('No registration token available. Request permission to generate one.');
        }
      } else {
        console.log('Unable to get permission to notify.');
      }
    } catch (error) {
      console.error('Error initializing Firebase Messaging:', error);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-show-register').addEventListener('click', () => showSection('register'));
    document.getElementById('btn-show-password-popup').addEventListener('click', showPasswordPopup);
    document.getElementById('btn-show-search').addEventListener('click', () => showSection('search'));
    document.getElementById('btn-show-emergency').addEventListener('click', showEmergencyPopup);
    document.getElementById('btn-show-notifications').addEventListener('click', showNotifications);
    document.getElementById('btn-add-donor').addEventListener('click', addDonor);
    document.getElementById('btn-search-donor-edit').addEventListener('click', searchDonorToEdit);
    document.getElementById('btn-save-edit').addEventListener('click', saveEdit);
    document.getElementById('btn-delete-donor').addEventListener('click', deleteDonor);
    document.getElementById('btn-cancel-edit').addEventListener('click', cancelEdit);
    document.getElementById('btn-check-password').addEventListener('click', checkPassword);
    document.getElementById('btn-close-password-popup').addEventListener('click', closePasswordPopup);
    document.getElementById('btn-close-notifications').addEventListener('click', closeNotifications);
    document.getElementById('btn-send-emergency').addEventListener('click', sendEmergencyRequest);
    document.getElementById('btn-cancel-emergency').addEventListener('click', closeEmergencyPopup);
    document.getElementById('searchBlood').addEventListener('change', searchDonors);
    document.getElementById('searchQuery').addEventListener('input', searchDonors);
    document.getElementById('btn-save-donation-date').addEventListener('click', saveDonationDate);
    document.getElementById('btn-close-update-date-popup').addEventListener('click', closeUpdateDatePopup);
    document.getElementById('btn-nearby-donors').addEventListener('click', searchNearbyDonors);
    document.getElementById('btn-toggle-map').addEventListener('click', () => {
      const mapDiv = document.getElementById('donorsMap');
      mapDiv.style.display = mapDiv.style.display === 'none' ? 'block' : 'none';
      
      if (mapDiv.style.display === 'block') {
        initMap();
        if (currentDisplayedDonors.length > 0) {
          displayDonorsOnMap(currentDisplayedDonors);
        }
      }
    });
    document.getElementById('btn-start-app').addEventListener('click', () => showSection('register'));
    
    // أحداث استخدام الموقع الحالي
    document.getElementById('btn-get-current-location').addEventListener('click', function() {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function(position) {
          const userLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          
          locationMarker.setPosition(userLocation);
          locationPickerMap.setCenter(userLocation);
          document.getElementById('donorLatitude').value = userLocation.lat;
          document.getElementById('donorLongitude').value = userLocation.lng;
        }, function(error) {
          showMessage('تعذر الحصول على موقعك الحالي. يرجى تحديد الموقع يدوياً على الخريطة.', 'error');
        });
      } else {
        showMessage('متصفحك لا يدعم تحديد الموقع. يرجى تحديد الموقع يدوياً على الخريطة.', 'error');
      }
    });

    document.getElementById('btn-get-edit-current-location').addEventListener('click', function() {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function(position) {
          const userLocation = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          
          editLocationMarker.setPosition(userLocation);
          editLocationPickerMap.setCenter(userLocation);
          document.getElementById('editDonorLatitude').value = userLocation.lat;
          document.getElementById('editDonorLongitude').value = userLocation.lng;
        }, function(error) {
          showMessage('تعذر الحصول على موقعك الحالي. يرجى تحديد الموقع يدوياً على الخريطة.', 'error');
        });
      } else {
        showMessage('متصفحك لا يدعم تحديد الموقع. يرجى تحديد الموقع يدوياً على الخريطة.', 'error');
      }
    });
    
    // أحداث نافذة طلب إذن الموقع
    document.getElementById('allowLocation').addEventListener('click', async () => {
      document.getElementById('locationPermission').style.display = 'none';
      
      try {
        // الحصول على الموقع الحالي بعد منح الإذن
        const position = await getCurrentLocation();
        
        // عرض رسالة تأكيد للمستخدم
        const confirmUpdate = confirm('هل ترغب في تحديث موقعك الحالي في قاعدة البيانات إذا كنت متبرعاً مسجلاً؟');
        
        if (confirmUpdate) {
          // استدعاء دالة التحقق والتحديث
          await checkAndUpdateCurrentDonor();
        } else {
          showMessage('تم منح إذن الوصول إلى الموقع. يمكنك الآن استخدام زر "البحث عن متبرعين قريبين"', 'success');
        }
      } catch (error) {
        console.error('Error getting location:', error);
        showMessage('تم منح إذن الوصول إلى الموقع. يمكنك الآن استخدام زر "البحث عن متبرعين قريبين"', 'success');
      }
    });
    
    document.getElementById('denyLocation').addEventListener('click', () => {
      document.getElementById('locationPermission').style.display = 'none';
      showMessage('لن تتمكن من رؤية المتبرعين القريبين منك بدون إذن الموقع', 'error');
    });
    
    // إظهار قسم الترحيب عند تحميل الصفحة
    showSection('welcome');
    
    // تهيئة إشعارات Firebase
    initializeFirebaseMessaging();
    
    // التحقق من تحميل Google Maps API بشكل دوري
    let mapCheckInterval = setInterval(() => {
      if (typeof google !== 'undefined' && typeof google.maps !== 'undefined') {
        clearInterval(mapCheckInterval);
        initMap();
        initLocationPickerMap();
      }
    }, 100);
  });