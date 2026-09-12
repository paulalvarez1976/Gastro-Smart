import { collection, getDocs, writeBatch, doc } from 'firebase/firestore';
import { db } from '../firebase';

export async function seedInitialDataIfEmpty() {
  try {
    const restSnapshot = await getDocs(collection(db, 'restaurants'));
    if (!restSnapshot.empty) {
      console.log('Firebase database already has restaurant data.');
      return;
    }

    console.log('Seeding initial demo data for Gastro Smart...');
    const batch = writeBatch(db);

    // 1. Restaurantes (2 sedes iniciales)
    const rest1Ref = doc(collection(db, 'restaurants'));
    const rest1Id = rest1Ref.id;
    batch.set(rest1Ref, {
      nombre: 'Gastro Smart - Sede Central',
      direccion: 'Av. Libertador 1450, Centro',
      telefono: '+1 (555) 234-5678',
      activo: true,
      creadoEn: new Date().toISOString()
    });

    const rest2Ref = doc(collection(db, 'restaurants'));
    const rest2Id = rest2Ref.id;
    batch.set(rest2Ref, {
      nombre: 'Gastro Smart - Sede Norte',
      direccion: 'Calle Gourmet 88, Mall Plaza Norte',
      telefono: '+1 (555) 987-6543',
      activo: true,
      creadoEn: new Date().toISOString()
    });

    // 2. Empleados con PIN de 4 dígitos
    const employees = [
      {
        nombre: 'Carlos Admin (Gerente)',
        puesto: 'admin',
        pin: '1111',
        tarifaHora: 22.50,
        restaurantId: rest1Id,
        activo: true,
      },
      {
        nombre: 'Valeria Soto (Cajera)',
        puesto: 'caja',
        pin: '2222',
        tarifaHora: 14.00,
        restaurantId: rest1Id,
        activo: true,
      },
      {
        nombre: 'Mateo Rivas (Mesero)',
        puesto: 'mesero',
        pin: '3333',
        tarifaHora: 12.50,
        restaurantId: rest1Id,
        activo: true,
      },
      {
        nombre: 'Chef Marcos Peña',
        puesto: 'cocina',
        pin: '4444',
        tarifaHora: 18.00,
        restaurantId: rest1Id,
        activo: true,
      },
      {
        nombre: 'Elena Gómez (Mesera Norte)',
        puesto: 'mesero',
        pin: '5555',
        tarifaHora: 12.50,
        restaurantId: rest2Id,
        activo: true,
      },
      {
        nombre: 'Lucas Silva (Ayudante)',
        puesto: 'ayudante_cocina',
        pin: '6666',
        tarifaHora: 11.00,
        restaurantId: rest1Id,
        activo: true,
      },
      {
        nombre: 'Rosa Morales (Limpieza)',
        puesto: 'limpieza',
        pin: '7777',
        tarifaHora: 10.50,
        restaurantId: rest1Id,
        activo: true,
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
        restaurantId: rest1Id,
        numero: i,
        estado: 'libre',
        capacidad: i <= 4 ? 2 : (i <= 8 ? 4 : 6)
      });
    }

    // Mesas para Sede Norte
    for (let i = 1; i <= 6; i++) {
      const tableRef = doc(collection(db, 'tables'));
      batch.set(tableRef, {
        restaurantId: rest2Id,
        numero: i,
        estado: 'libre',
        capacidad: 4
      });
    }

    // 4. Platos del Menú
    const menuItems = [
      {
        nombre: 'Hamburguesa Gourmet Angus',
        descripcion: '200g de carne Angus, queso cheddar fundido, tocino crujiente, cebolla caramelizada y salsa especial en pan brioche.',
        precio: 14.50,
        categoria: 'Hamburguesas',
        disponible: true,
        restaurantId: rest1Id,
        imagenUrl: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500&auto=format&fit=crop&q=60'
      },
      {
        nombre: 'Hamburguesa BBQ Ahumada',
        descripcion: 'Doble medallón de res, salsa barbacoa artesanal, aros de cebolla y queso gouda.',
        precio: 15.00,
        categoria: 'Hamburguesas',
        disponible: true,
        restaurantId: rest1Id,
        imagenUrl: 'https://images.unsplash.com/photo-1553979459-d2229ba7433b?w=500&auto=format&fit=crop&q=60'
      },
      {
        nombre: 'Pizza Margherita Di Bufala',
        descripcion: 'Masa madre tradicional, salsa pomodoro italiana, mozzarella di bufala fresca y hojas de albahaca aromática.',
        precio: 16.00,
        categoria: 'Pizzas',
        disponible: true,
        restaurantId: rest1Id,
        imagenUrl: 'https://images.unsplash.com/photo-1604382355076-af4b0eb60143?w=500&auto=format&fit=crop&q=60'
      },
      {
        nombre: 'Pizza Cuatro Quesos & Miel',
        descripcion: 'Gorgonzola, parmesano reggiano, mozzarella, ricotta y un toque sutil de miel trufada.',
        precio: 17.50,
        categoria: 'Pizzas',
        disponible: true,
        restaurantId: rest1Id,
        imagenUrl: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=500&auto=format&fit=crop&q=60'
      },
      {
        nombre: 'Lomo Saltado Clásico',
        descripcion: 'Trozos finos de lomo fino salteados al wok con cebolla morada, tomates frescos, ají amarillo y papas rústicas doradas.',
        precio: 18.50,
        categoria: 'Platos Fuertes',
        disponible: true,
        restaurantId: rest1Id,
        imagenUrl: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=500&auto=format&fit=crop&q=60'
      },
      {
        nombre: 'Salmón Grillé con Espárragos',
        descripcion: 'Filete de salmón fresco a la plancha con costra de finas hierbas y puré cremoso de papas trufadas.',
        precio: 21.00,
        categoria: 'Platos Fuertes',
        disponible: true,
        restaurantId: rest1Id,
        imagenUrl: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=500&auto=format&fit=crop&q=60'
      },
      {
        nombre: 'Papas Rústicas Trufadas',
        descripcion: 'Papas cortadas a mano con aceite de trufa blanca, parmesano rallado y dip de ajo asado.',
        precio: 7.50,
        categoria: 'Entradas',
        disponible: true,
        restaurantId: rest1Id,
        imagenUrl: 'https://images.unsplash.com/photo-1576107232684-1279f3908594?w=500&auto=format&fit=crop&q=60'
      },
      {
        nombre: 'Alitas Glaseadas Picantes (8 uds)',
        descripcion: 'Alitas marinadas y glaseadas en reducción de ají dulce con aderezo blue cheese casero.',
        precio: 10.50,
        categoria: 'Entradas',
        disponible: true,
        restaurantId: rest1Id,
        imagenUrl: 'https://images.unsplash.com/photo-1567620832903-9fc6debc209f?w=500&auto=format&fit=crop&q=60'
      },
      {
        nombre: 'Limonada de Hierbabuena Frozen',
        descripcion: 'Limones verdes recién exprimidos, hojas de hierbabuena fresca y toque de jengibre.',
        precio: 4.50,
        categoria: 'Bebidas',
        disponible: true,
        restaurantId: rest1Id,
        imagenUrl: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=500&auto=format&fit=crop&q=60'
      },
      {
        nombre: 'Cerveza Artesanal IPA 500ml',
        descripcion: 'Cerveza lupulada de cuerpo medio con notas cítricas y amargor equilibrado.',
        precio: 6.00,
        categoria: 'Bebidas',
        disponible: true,
        restaurantId: rest1Id,
        imagenUrl: 'https://images.unsplash.com/photo-1608270546103-9c882103f56e?w=500&auto=format&fit=crop&q=60'
      },
      {
        nombre: 'Tiramisú Tradicional',
        descripcion: 'Bizcochos savoiardi bañados en café espresso italiano, capas de queso mascarpone y cacao amargo.',
        precio: 6.50,
        categoria: 'Postres',
        disponible: true,
        restaurantId: rest1Id,
        imagenUrl: 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=500&auto=format&fit=crop&q=60'
      }
    ];

    for (const item of menuItems) {
      const itemRef = doc(collection(db, 'menuItems'));
      batch.set(itemRef, item);
    }

    // 5. Clientes demo frecuentes
    const clients = [
      { nombre: 'Sofía Morales', telefono: '+1 555-4321', email: 'sofia@example.com', direccion: 'Calle Las Acacias 240' },
      { nombre: 'Juan Pérez', telefono: '+1 555-8765', email: 'juan@example.com', direccion: 'Av. Primavera 102' }
    ];

    for (const cli of clients) {
      const cliRef = doc(collection(db, 'clients'));
      batch.set(cliRef, cli);
    }

    await batch.commit();
    console.log('Initial seed completed successfully.');
  } catch (err) {
    console.error('Error seeding initial data:', err);
  }
}
