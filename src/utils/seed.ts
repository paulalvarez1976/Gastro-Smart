import { collection, getDocs, writeBatch, doc } from 'firebase/firestore';
import { db } from '../firebase';

export async function seedInitialDataIfEmpty() {
  try {
    const bizSnap = await getDocs(collection(db, 'businesses'));
    let defaultBizId = 'biz_default';

    if (bizSnap.empty) {
      console.log('Seeding initial business and data for Gastro Smart...');
      const batch = writeBatch(db);

      // Crear negocio inicial por defecto
      const bizRef = doc(db, 'businesses', defaultBizId);
      batch.set(bizRef, {
        nombre: 'Gastro Smart Group',
        rif_o_ruc: 'J-12345678-0',
        plan: 'pro',
        activo: true,
        creadoEn: new Date().toISOString(),
        ownerUid: 'admin_initial',
        email: 'admin@gastrosmart.com',
        appId: 'gastro_smart',
        logoUrl: null
      });

      // 1. Restaurantes (2 sedes iniciales)
      const rest1Ref = doc(collection(db, 'restaurants'));
      const rest1Id = rest1Ref.id;
      batch.set(rest1Ref, {
        businessId: defaultBizId,
        nombre: 'Gastro Smart - Sede Central',
        direccion: 'Av. Libertador 1450, Centro',
        telefono: '+1 (555) 234-5678',
        numeroMesas: 10,
        activo: true,
        appId: 'gastro_smart',
        creadoEn: new Date().toISOString()
      });

      const rest2Ref = doc(collection(db, 'restaurants'));
      const rest2Id = rest2Ref.id;
      batch.set(rest2Ref, {
        businessId: defaultBizId,
        nombre: 'Gastro Smart - Sede Norte',
        direccion: 'Calle Gourmet 88, Mall Plaza Norte',
        telefono: '+1 (555) 987-6543',
        numeroMesas: 6,
        activo: true,
        appId: 'gastro_smart',
        creadoEn: new Date().toISOString()
      });

      // 2. Empleados con PIN de 4 dígitos para operativa (meseros, cocina, caja)
      const employees = [
        {
          businessId: defaultBizId,
          nombre: 'Valeria Soto (Cajera)',
          puesto: 'caja',
          pin: '2222',
          tarifaHora: 14.00,
          restaurantId: rest1Id,
          activo: true,
          appId: 'gastro_smart',
        },
        {
          businessId: defaultBizId,
          nombre: 'Mateo Rivas (Mesero)',
          puesto: 'mesero',
          pin: '3333',
          tarifaHora: 12.50,
          restaurantId: rest1Id,
          activo: true,
          appId: 'gastro_smart',
        },
        {
          businessId: defaultBizId,
          nombre: 'Chef Marcos Peña',
          puesto: 'cocina',
          pin: '4444',
          tarifaHora: 18.00,
          restaurantId: rest1Id,
          activo: true,
          appId: 'gastro_smart',
        },
        {
          businessId: defaultBizId,
          nombre: 'Elena Gómez (Mesera)',
          puesto: 'mesero',
          pin: '5555',
          tarifaHora: 12.50,
          restaurantId: rest2Id,
          activo: true,
          appId: 'gastro_smart',
        },
        {
          businessId: defaultBizId,
          nombre: 'Lucas Silva (Ayudante)',
          puesto: 'ayudante_cocina',
          pin: '6666',
          tarifaHora: 11.00,
          restaurantId: rest1Id,
          activo: true,
          appId: 'gastro_smart',
        },
        {
          businessId: defaultBizId,
          nombre: 'Rosa Morales (Limpieza)',
          puesto: 'limpieza',
          pin: '7777',
          tarifaHora: 10.50,
          restaurantId: rest1Id,
          activo: true,
          appId: 'gastro_smart',
        }
      ];

      for (const emp of employees) {
        const empRef = doc(collection(db, 'employees'));
        batch.set(empRef, {
          ...emp,
          creadoEn: new Date().toISOString()
        });
      }

      // 3. Mesas para Sede Central
      for (let i = 1; i <= 10; i++) {
        const tableRef = doc(collection(db, 'tables'));
        batch.set(tableRef, {
          businessId: defaultBizId,
          restaurantId: rest1Id,
          numero: i,
          estado: 'libre',
          capacidad: i <= 4 ? 2 : (i <= 8 ? 4 : 6),
          appId: 'gastro_smart'
        });
      }

      // Mesas para Sede Norte
      for (let i = 1; i <= 6; i++) {
        const tableRef = doc(collection(db, 'tables'));
        batch.set(tableRef, {
          businessId: defaultBizId,
          restaurantId: rest2Id,
          numero: i,
          estado: 'libre',
          capacidad: 4,
          appId: 'gastro_smart'
        });
      }

      // 4. Platos del Menú
      const menuItems = [
        {
          businessId: defaultBizId,
          nombre: 'Hamburguesa Gourmet Angus',
          descripcion: '200g de carne Angus, queso cheddar fundido, tocino crujiente, cebolla caramelizada en pan brioche.',
          precio: 14.50,
          categoria: 'Hamburguesas',
          disponible: true,
          restaurantId: rest1Id,
          appId: 'gastro_smart',
          imagenUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500&auto=format&fit=crop&q=60'
        },
        {
          businessId: defaultBizId,
          nombre: 'Pizza Margherita Di Bufala',
          descripcion: 'Masa madre tradicional, salsa pomodoro italiana, mozzarella di bufala fresca y albahaca.',
          precio: 16.00,
          categoria: 'Pizzas',
          disponible: true,
          restaurantId: rest1Id,
          appId: 'gastro_smart',
          imagenUrl: 'https://images.unsplash.com/photo-1604382355076-af4b0eb60143?w=500&auto=format&fit=crop&q=60'
        },
        {
          businessId: defaultBizId,
          nombre: 'Lomo Saltado Clásico',
          descripcion: 'Lomo fino al wok con cebolla morada, tomates frescos, ají amarillo y papas rústicas doradas.',
          precio: 18.50,
          categoria: 'Platos Fuertes',
          disponible: true,
          restaurantId: rest1Id,
          appId: 'gastro_smart',
          imagenUrl: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=500&auto=format&fit=crop&q=60'
        },
        {
          businessId: defaultBizId,
          nombre: 'Papas Rústicas Trufadas',
          descripcion: 'Papas cortadas a mano con aceite de trufa blanca, parmesano rallado y dip de ajo asado.',
          precio: 7.50,
          categoria: 'Entradas',
          disponible: true,
          restaurantId: rest1Id,
          appId: 'gastro_smart',
          imagenUrl: 'https://images.unsplash.com/photo-1576107232684-1279f3908594?w=500&auto=format&fit=crop&q=60'
        },
        {
          businessId: defaultBizId,
          nombre: 'Limonada de Hierbabuena Frozen',
          descripcion: 'Limones verdes recién exprimidos, hojas de hierbabuena fresca y toque de jengibre.',
          precio: 4.50,
          categoria: 'Bebidas',
          disponible: true,
          restaurantId: rest1Id,
          appId: 'gastro_smart',
          imagenUrl: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=500&auto=format&fit=crop&q=60'
        },
        {
          businessId: defaultBizId,
          nombre: 'Tiramisú Tradicional',
          descripcion: 'Bizcochos savoiardi bañados en espresso, queso mascarpone y cacao amargo.',
          precio: 6.50,
          categoria: 'Postres',
          disponible: true,
          restaurantId: rest1Id,
          appId: 'gastro_smart',
          imagenUrl: 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=500&auto=format&fit=crop&q=60'
        }
      ];

      for (const item of menuItems) {
        const itemRef = doc(collection(db, 'menuItems'));
        batch.set(itemRef, item);
      }

      await batch.commit();
      console.log('Initial seed completed successfully with multi-tenant structure.');
    }
  } catch (err) {
    console.error('Error seeding initial data:', err);
  }
}
