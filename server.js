import express from "express";
import cors from "cors";
import dotenv from "dotenv";


import { MongoClient, ObjectId } from "mongodb";
dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const client = new MongoClient(process.env.MONGO_URL);
let db;

// ==============================
// 🔌 CONNECT TO DATABASE
// ==============================
async function connectDB() {
  try {
    await client.connect();
    db = client.db("hotelDB");
    console.log("✅ Connected to MongoDB!");
  } catch (error) {
    console.error("❌ Database connection failed:", error);
  }
}
connectDB();


//===================================
// register 
//==================================
app.post("/register", async (req, res) => {
  const { name, email, phone, password } = req.body;

  try {
    const existingUser = await db.collection("users").findOne({ email });
    if (existingUser)
      return res.json({ success: false, message: "User already exists" });

    // ✅ Include createdAt for new registrations
    const newUser = {
      name,
      email,
      phone,
      password,
      createdAt: new Date(),
    };

    await db.collection("users").insertOne(newUser);

    res.json({ success: true, message: "User registered successfully" });
  } catch (error) {
    console.error("Error in /register:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});



// ==============================
// 🔐 UNIVERSAL LOGIN ROUTE (User / Owner / Admin)
// ==============================
app.post("/login", async (req, res) => {
  const { email, password, role } = req.body;

  try {
    let user;

    // 👤 USER LOGIN
    if (role === "user") {
      user = await db.collection("users").findOne({ email });
      if (!user)
        return res.json({ success: false, message: "User not found" });
      if (user.password !== password)
        return res.json({ success: false, message: "Invalid password" });

      return res.json({
        success: true,
        message: "User login successful",
        user: { _id: user._id, name: user.name, email: user.email, role: "user" },
      });
    }

    // 🏨 OWNER LOGIN
    if (role === "owner") {
      const hotel = await db.collection("hotels").findOne({ "owner.email": email });
      if (!hotel)
        return res.json({ success: false, message: "Owner not found" });
      if (hotel.owner.password !== password)
        return res.json({ success: false, message: "Invalid password" });

      return res.json({
        success: true,
        message: "Owner login successful",
        user: {
          _id: hotel._id,
          name: hotel.owner.name,
          email: hotel.owner.email,
          role: "owner",
        },
      });
    }

    // 🧑‍💼 ADMIN LOGIN (from MongoDB)
    if (role === "admin") {
      const admin = await db.collection("admins").findOne({ email });
      if (!admin)
        return res.json({ success: false, message: "Admin not found" });
      if (admin.password !== password)
        return res.json({ success: false, message: "Invalid password" });

      return res.json({
        success: true,
        message: "Admin login successful",
        user: {
          _id: admin._id,
          name: admin.name,
          email: admin.email,
          role: "admin",
        },
      });
    }

    res.json({ success: false, message: "Invalid role selected" });
  } catch (error) {
    console.error("Error in /login:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});












// ==============================
// 🏨 HOTEL ROUTES
// ==============================
app.get("/hotels", async (req, res) => {
  try {
    const hotels = await db.collection("hotels").find().toArray();
    res.json(hotels);
  } catch (error) {
    console.error("Error fetching hotels:", error);
    res.status(500).json({ error: "Failed to fetch hotels" });
  }
});

app.get("/hotels/:hotelid", async (req, res) => {
  try {
    const hotelid = Number(req.params.hotelid);
    const hotel = await db.collection("hotels").findOne({ hotelid });
    if (!hotel) return res.status(404).json({ message: "Hotel not found" });
    res.json(hotel);
  } catch (error) {
    console.error("Error fetching hotel:", error);
    res.status(500).json({ message: "Error fetching hotel" });
  }
});

// ==============================
// 🛏️ ROOM ROUTES
// ==============================
app.get("/rooms/:hotelid", async (req, res) => {
  try {
    const hotelId = Number(req.params.hotelid);
    const rooms = await db.collection("rooms").find({ hotelId }).toArray();
    if (!rooms.length)
      return res.status(404).json({ message: "No rooms found for this hotel" });
    res.json(rooms);
  } catch (error) {
    console.error("Error fetching rooms:", error);
    res.status(500).json({ message: "Error fetching rooms" });
  }
});

// ==============================
// ✅ CHECK ROOM AVAILABILITY
// ==============================
app.post("/check-availability", async (req, res) => {
  try {
    const { roomId, checkIn, checkOut, numRooms } = req.body;
    console.log("📩 /check-availability hit with body:", req.body);

    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (!roomId || !checkIn || !checkOut || !numRooms)
      return res.status(400).json({ success: false, message: "Missing required fields." });

    if (isNaN(checkInDate) || isNaN(checkOutDate))
      return res.status(400).json({ success: false, message: "Invalid date format." });

    if (checkInDate < today || checkOutDate < today)
      return res.status(400).json({ success: false, message: "Cannot book past dates." });

    if (checkOutDate <= checkInDate)
      return res.status(400).json({ success: false, message: "Check-out date must be after check-in date." });

    // 🔎 Find room by numeric roomId
    const room = await db.collection("rooms").findOne({ roomId: Number(roomId) });
    if (!room)
      return res.status(404).json({ success: false, message: "Room not found." });

    // 🧾 Get bookings for that room
    const bookings = await db.collection("bookings").find({ roomId: Number(roomId) }).toArray();

    // 🧮 Check overlaps
    const overlapping = bookings.filter((b) => {
      const existingIn = new Date(b.checkIn);
      const existingOut = new Date(b.checkOut);
      return checkInDate < existingOut && checkOutDate > existingIn;
    });

    if (overlapping.length > 0) {
      return res.json({
        success: true,
        available: false,
        availableRooms: 0,
        message: "Room not available for selected dates."
      });
    }

    // 🧮 Check number of rooms
    if ((room.availableRooms || room.numberOfRooms) < numRooms) {
      return res.json({
        success: true,
        available: false,
        availableRooms: room.numberOfRooms || 0,
        message: "Not enough rooms available."
      });
    }

    // ✅ Room available
    return res.json({
      success: true,
      available: true,
      availableRooms: room.numberOfRooms || room.availableRooms || 0,
      message: "Room is available!"
    });

  } catch (err) {
    console.error("❌ Error checking availability:", err);
    res.status(500).json({ success: false, message: "Server error checking availability." });
  }
});








// ==============================
// 🧳 GET USER BOOKINGS
// ==============================
app.get("/mybookings/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const bookings = await db
      .collection("bookings")
      .aggregate([
        { $match: { userId } },
        {
          $lookup: {
            from: "hotels",
            localField: "hotelId",
            foreignField: "_id",
            as: "hotelDetails",
          },
        },
      {
  $lookup: {
    from: "rooms",
    localField: "roomId",
    foreignField: "roomId",
    as: "roomDetails",
  },
},

      ])
      .toArray();

    const formatted = bookings.map((b) => ({
      ...b,
      hotelName: b.hotelDetails?.[0]?.name || "Unknown Hotel",
    }));

    res.json({ success: true, bookings: formatted });
  } catch (err) {
    console.error("Error fetching user bookings:", err);
    res.json({ success: false, message: "Failed to fetch bookings." });
  }
});






// ==============================
// 💬 FEEDBACK ROUTES
// ==============================
// ==============================
// 💬 FEEDBACK ROUTES
// ==============================

// ➕ Add feedback
// ➕ Add feedback (with debug logs)
app.post("/feedback", async (req, res) => {
  try {
    const { userId, bookingId, hotelId, rating, comment } = req.body;
    console.log("📩 Feedback received:", { userId, bookingId, hotelId, rating, comment });

    if (!userId || !bookingId || !hotelId || !rating) {
      console.warn("⚠️ Missing fields:", { userId, bookingId, hotelId, rating });
      return res.status(400).json({ success: false, message: "Missing required fields." });
    }

    // Convert IDs safely
    const toObjectId = (id) => {
      if (ObjectId.isValid(id)) return new ObjectId(id);
      return id; // keep as string
    };

    const feedbackDoc = {
      userId: toObjectId(userId),
      bookingId: toObjectId(bookingId),
      hotelId: toObjectId(hotelId),
      rating: Number(rating),
      comment,
      createdAt: new Date(),
    };

    console.log("📝 Feedback to insert:", feedbackDoc);

    const result = await db.collection("feedback").insertOne(feedbackDoc);

    console.log("✅ Feedback inserted with ID:", result.insertedId);

    res.json({ success: true, message: "✅ Feedback added successfully", id: result.insertedId });
  } catch (error) {
    console.error("❌ Error adding feedback:", error);
    res.status(500).json({
      success: false,
      message: "Failed to add feedback",
      error: error.message, // <-- ADD THIS LINE
    });
  }
});

// 🧾 Get feedback for a booking
app.get("/feedback/:bookingId", async (req, res) => {
  try {
    const bookingId = req.params.bookingId;
    const feedback = await db.collection("feedback").findOne({
      bookingId: new ObjectId(bookingId),
    });

    if (!feedback) {
      return res.json({ success: false, message: "No feedback found" });
    }

    res.json({ success: true, feedback });
  } catch (error) {
    console.error("❌ Error fetching feedback:", error);
    res.status(500).json({ success: false, message: "Failed to fetch feedback" });
  }
});

// ✏️ Update feedback
app.put("/feedback/:id", async (req, res) => {
  try {
    const { rating, comment } = req.body;

    if (!rating && !comment)
      return res.status(400).json({ success: false, message: "No updates provided" });

    await db.collection("feedback").updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { rating: Number(rating), comment } }
    );

    res.json({ success: true, message: "Feedback updated successfully" });
  } catch (error) {
    console.error("❌ Error updating feedback:", error);
    res.status(500).json({ success: false, message: "Failed to update feedback" });
  }
});

// ❌ Delete feedback
app.delete("/feedback/:id", async (req, res) => {
  try {
    await db.collection("feedback").deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ success: true, message: "Feedback deleted successfully" });
  } catch (error) {
    console.error("❌ Error deleting feedback:", error);
    res.status(500).json({ success: false, message: "Failed to delete feedback" });
  }
});

// POST /feedback

 
// ==============================
// ❌ CANCEL BOOKING (within 24 hours)
// ==============================
app.put("/cancel-booking/:bookingId", async (req, res) => {
  try {
    const bookingId = req.params.bookingId;
    console.log("🟢 Cancel request for bookingId:", bookingId);

    const booking = await db.collection("bookings").findOne({ _id: new ObjectId(bookingId) });

    if (!booking) {
      return res.status(404).json({ success: false, message: "Booking not found" });
    }

    const now = new Date();
    const createdAt = new Date(booking.createdAt);
    const hoursSinceBooking = (now - createdAt) / (1000 * 60 * 60);

    // ⛔ Can't cancel within first 24 hours
    if (hoursSinceBooking < 24) {
      return res.json({
        success: false,
        message: "You can only cancel your booking after 24 hours of booking.",
      });
    }

    // ✅ Allow cancellation after 24 hours
    await db.collection("bookings").updateOne(
      { _id: new ObjectId(bookingId) },
      { $set: { bookingStatus: "Cancelled" } }
    );

    // ✅ Optionally restore room availability
    await db.collection("rooms").updateOne(
      { roomId: booking.roomId },
      { $inc: { numberOfRooms: booking.numRooms } }
    );

    res.json({ success: true, message: "✅ Booking cancelled successfully after 24 hours!" });
  } catch (error) {
    console.error("Error cancelling booking:", error);
    res.status(500).json({ success: false, message: "Failed to cancel booking" });
  }
});



app.get("/hotel/:id", async (req, res) => {
  try {
    const roomId = req.params.id; // room _id from frontend
   const room =
  (await db.collection("rooms").findOne({ roomId: Number(roomId) })) ||
  (await db.collection("rooms").findOne({ _id: new ObjectId(roomId) }));


    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    // Use the hotelId from room to find the hotel name
    const hotel = await db.collection("hotels").findOne({ hotelid: Number(room.hotelId) });

    if (!hotel) {
      return res.status(404).json({ message: "Hotel not found for this room" });
    }

    // return only the necessary info
    res.json({
      success: true,
      hotelName: hotel.name,
      hotelId: hotel.hotelid,
    });
  } catch (error) {
    console.error("Error fetching hotel from room:", error);
    res.status(500).json({ message: "Error fetching hotel details" });
  }
});


// ✅ Get hotel name by roomId (SAFE VERSION)
app.get("/hotel-by-room/:roomId", async (req, res) => {
  try {
    const roomId = req.params.roomId;

    // Build safe OR query
    const query = [];

    // ✔ Only push _id search if roomId is a valid ObjectId
    if (ObjectId.isValid(roomId)) {
      query.push({ _id: new ObjectId(roomId) });
    }

    // ✔ Always search by numeric roomId as well
    query.push({ roomId: Number(roomId) });

    // Find the room
    const room = await db.collection("rooms").findOne({ $or: query });

    if (!room) {
      return res
        .status(404)
        .json({ success: false, message: "Room not found" });
    }

    // Find the hotel for this room
    const hotel = await db
      .collection("hotels")
      .findOne({ hotelid: Number(room.hotelId) });

    if (!hotel) {
      return res
        .status(404)
        .json({ success: false, message: "Hotel not found" });
    }

    // Success
    res.json({
      success: true,
      hotelName: hotel.name,
      hotelId: hotel.hotelid,
    });
  } catch (err) {
    console.error("❌ Error in /hotel-by-room:", err);
    res.status(500).json({ success: false, message: "Error fetching hotel name" });
  }
});




/// ==============================
// 🧾 ADD BILL (LINKED TO BOOKING, OPTIONAL)
// ==============================
app.post("/add-bill", async (req, res) => {
  try {
    const { bookingId, hotel, room, guestName, email, phone, checkIn, checkOut, numRooms, totalAmount } = req.body;

    // ✅ only hotel + guestName are required
    if (!guestName || !hotel) {
      return res.status(400).json({ success: false, message: "Missing required fields (hotel or guestName)" });
    }

    const billData = {
      ...(bookingId && { bookingId }), // only include if present
      hotel,
      room,
      guestName,
      email: email || "",
      phone: phone || "",
      checkIn: checkIn || "",
      checkOut: checkOut || "",
      numRooms: numRooms || 1,
      totalAmount: totalAmount || 0,
      paymentStatus: "Pending",
      createdAt: new Date(),
    };

    const result = await db.collection("bills").insertOne(billData);

    console.log("✅ Bill saved:", result.insertedId);
    res.json({ success: true, message: "Bill saved successfully", billId: result.insertedId });
  } catch (err) {
    console.error("❌ Error saving bill:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});



// ==============================
// 🧾 GET BILL BY BILL ID
// ==============================
app.get("/bill/:billId", async (req, res) => {
  try {
    const { billId } = req.params;

    if (!ObjectId.isValid(billId)) {
      return res.status(400).json({ success: false, message: "Invalid bill ID format" });
    }

    const bill = await db.collection("bills").findOne({ _id: new ObjectId(billId) });

    if (!bill) {
      return res.status(404).json({ success: false, message: "Bill not found" });
    }

    res.json({ success: true, bill });
  } catch (err) {
    console.error("❌ Error fetching bill:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


// ==============================
// ✅ FETCH HOTELS BY OWNER EMAIL
// ==============================
app.get("/owner-hotels/:email", async (req, res) => {
  try {
    const { email } = req.params;
    if (!email)
      return res.status(400).json({ success: false, message: "Owner email required" });

    console.log("🔍 Fetching hotels for owner email:", email);

    const hotels = await db.collection("hotels").find({ "owner.email": email }).toArray();

    if (!hotels.length) {
      return res.status(404).json({
        success: false,
        message: `No hotels found for ${email}`,
      });
    }

    res.json({ success: true, hotels });
  } catch (error) {
    console.error("❌ Error fetching owner hotels:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ✅ SMART VERSION: Fetch all bookings for owner's hotels (auto-matched to bills)
app.get("/owner-bookings/:email", async (req, res) => {
  try {
    const { email } = req.params;

    // 1️⃣ Find all hotels owned by this owner
    const ownerHotels = await db.collection("hotels").find({ "owner.email": email }).toArray();
    if (!ownerHotels.length)
      return res.json({ success: true, bookings: [] });

    const hotelIds = ownerHotels.map((h) => h.hotelid);

    // 2️⃣ Get all rooms for those hotels
    const rooms = await db.collection("rooms").find({ hotelId: { $in: hotelIds } }).toArray();
    const roomMap = Object.fromEntries(rooms.map(r => [r.roomId, r]));

    // 3️⃣ Get all bookings linked to those room IDs
    const roomIds = rooms.map(r => r.roomId);
    const bookings = await db.collection("bookings").find({ roomId: { $in: roomIds } }).toArray();

    if (!bookings.length)
      return res.json({ success: true, bookings: [] });

    // 4️⃣ Get all bills (we’ll fuzzy match)
    const bills = await db.collection("bills").find().toArray();

    // 5️⃣ Merge everything together
    const detailedBookings = bookings.map(b => {
      const room = roomMap[b.roomId];
      const hotel = ownerHotels.find(h => h.hotelid === room?.hotelId);

      // 🧠 Try to find bill by same guest + hotel name (case-insensitive)
      const bill = bills.find(bill =>
        bill.guestName?.toLowerCase() === b.guestName?.toLowerCase() &&
        bill.hotel?.name?.toLowerCase().includes(hotel?.name?.toLowerCase())
      );

      return {
        billId: bill?._id?.toString() || null, // ✅ Used for payment updates
        guestName: b.guestName,
        checkIn: b.checkIn,
        checkOut: b.checkOut,
        numRooms: b.numRooms,
        hotelName: hotel?.name || "Unknown Hotel",
        city: hotel?.city || "",
        roomType: room?.roomType || "Unknown",
        bookingStatus: b.bookingStatus || "Confirmed",
        paymentStatus: bill?.paymentStatus || "Pending",
      };
    });
// just before res.json({ success: true, bookings: detailedBookings });
console.log("🧾 owner-bookings response sample:", detailedBookings.slice(0, 10));

    console.log("✅ Owner bookings fetched:", detailedBookings.length);
    res.json({ success: true, bookings: detailedBookings });
  } catch (error) {
    console.error("❌ Error fetching owner bookings:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});




// ✏️ Update room details
app.put("/update-room/:id", async (req, res) => {
  try {
    const roomId = req.params.id;
    const updates = req.body;
    await db.collection("rooms").updateOne(
      { _id: new ObjectId(roomId) },
      { $set: updates }
    );
    res.json({ success: true, message: "Room updated successfully" });
  } catch (error) {
    console.error("Error updating room:", error);
    res.status(500).json({ success: false, message: "Error updating room" });
  }
});

// 🗑️ Delete room
app.delete("/delete-room/:id", async (req, res) => {
  try {
    const roomId = req.params.id;
    await db.collection("rooms").deleteOne({ _id: new ObjectId(roomId) });
    res.json({ success: true, message: "Room deleted successfully" });
  } catch (error) {
    console.error("Error deleting room:", error);
    res.status(500).json({ success: false, message: "Error deleting room" });
  }
});
// ✏️ Update room
app.put("/update-room/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    await db.collection("rooms").updateOne(
      { _id: new ObjectId(id) },
      { $set: updates }
    );
    res.json({ success: true, message: "Room updated successfully" });
  } catch (err) {
    console.error("Error updating room:", err);
    res.status(500).json({ success: false, message: "Error updating room" });
  }
});

// ❌ Delete room
app.delete("/delete-room/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // 🧠 Allow delete by _id or roomId (number)
    const query = ObjectId.isValid(id)
      ? { _id: new ObjectId(id) }
      : { roomId: Number(id) };

    const result = await db.collection("rooms").deleteOne(query);

    if (result.deletedCount === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Room not found or invalid ID" });
    }

    res.json({ success: true, message: "Room deleted successfully" });
  } catch (err) {
    console.error("Error deleting room:", err);
    res.status(500).json({ success: false, message: "Error deleting room" });
  }
});


// ✏️ UPDATE HOTEL DETAILS
app.put("/update-hotel/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    console.log("🛠️ Received hotel update for ID:", id);
    console.log("📦 Update data:", updates);

    // ✅ Validate ObjectId
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid hotel ID format",
      });
    }

    // ✅ Ensure amenities is always an array
    if (typeof updates.amenities === "string") {
      updates.amenities = updates.amenities.split(",").map((a) => a.trim());
    }

    // ✅ Perform update in MongoDB
    const result = await db.collection("hotels").updateOne(
      { _id: new ObjectId(id) },
      { $set: updates }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Hotel not found",
      });
    }

    res.json({
      success: true,
      message: "✅ Hotel updated successfully",
    });
  } catch (error) {
    console.error("❌ Error updating hotel:", error);
    res.status(500).json({
      success: false,
      message: "Server error while updating hotel",
      error: error.message,
    });
  }
});

// ✅ TEST ROUTE (to verify server works)
app.get("/test", (req, res) => {
  res.json({ success: true, message: "Backend running correctly ✅" });
});

// ==============================
// 💳 UPDATE PAYMENT STATUS BY BILL ID
// ==============================
app.put("/update-bill-payment/:billId", async (req, res) => {
  try {
    const { billId } = req.params;
    const { paymentStatus } = req.body; // e.g. "Paid" or "Pending"

    if (!paymentStatus) {
      return res.status(400).json({ success: false, message: "Missing paymentStatus" });
    }

    const result = await db.collection("bills").updateOne(
      { _id: new ObjectId(billId) },
      { $set: { paymentStatus, updatedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: "Bill not found" });
    }

    res.json({ success: true, message: "Payment status updated successfully" });
  } catch (err) {
    console.error("❌ Error updating bill payment:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


// ✅ Add this route in your Express backend
app.post("/add-room", async (req, res) => {
  try {
    console.log("📩 /add-room called with body:", req.body); // 👈 add this

    const {
      roomId,
      roomType,
      price,
      image,
      description,
      hotelId,
      availability,
      numberOfRooms,
    } = req.body;

    if (!hotelId || !roomType || !price) {
      console.warn("⚠️ Missing required fields");
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
    }

    const newRoom = {
      roomId: Number(roomId) || Math.floor(Math.random() * 1000),
      roomType,
      price: Number(price),
      image: image || "default_room.jpg",
      description,
      hotelId: Number(hotelId),
      availability: availability || "Available",
      numberOfRooms: Number(numberOfRooms) || 1,
      createdAt: new Date(),
    };

    console.log("📝 Inserting new room:", newRoom); // 👈 add this

    const result = await db.collection("rooms").insertOne(newRoom);

    console.log("✅ Mongo insert result:", result); // 👈 add this

    res.json({
      success: true,
      message: "✅ Room added successfully!",
      room: { _id: result.insertedId, ...newRoom },
    });
  } catch (err) {
    console.error("❌ Error adding room:", err);
    res.status(500).json({
      success: false,
      message: "Server error while adding room.",
      error: err.message,
    });
  }
});

// ==============================
// 👥 USERS ROUTES FOR ADMIN DASHBOARD
// ==============================

// ==============================
// 👥 USERS ROUTES FOR ADMIN DASHBOARD
// ==============================

// Get all users
app.get("/users", async (req, res) => {
  try {
    const users = await db.collection("users").find().toArray();
    res.json(users);
  } catch (error) {
    console.error("❌ Error fetching users:", error);
    res.status(500).json({ success: false, message: "Failed to fetch users" });
  }
});

// Delete user by ID
app.delete("/delete-user/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.collection("users").deleteOne({
      _id: new ObjectId(id),
    });

    if (result.deletedCount === 0)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    res.json({ success: true, message: "User deleted successfully" });
  } catch (error) {
    console.error("❌ Error deleting user:", error);
    res.status(500).json({ success: false, message: "Failed to delete user" });
  }
});


// ✏️ Update user (name, email, phone)
app.put("/update-user/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid user ID format" });
    }

    // Validate that at least one field is provided
    if (!name && !email && !phone) {
      return res.status(400).json({ success: false, message: "No fields to update" });
    }

    const updateFields = {};
    if (name) updateFields.name = name;
    if (email) updateFields.email = email;
    if (phone) updateFields.phone = phone;

    const result = await db.collection("users").updateOne(
      { _id: new ObjectId(id) },
      { $set: updateFields }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({ success: true, message: "✅ User updated successfully" });
  } catch (error) {
    console.error("❌ Error updating user:", error);
    res.status(500).json({ success: false, message: "Failed to update user" });
  }
});


app.post("/add-hotel", async (req, res) => {

  try {
    const { name, city, price, description, amenities, image, owner } = req.body;

    if (!name || !city || !price || !owner) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields (name, city, price, owner).",
      });
    }

    const newHotel = {
      hotelid: Math.floor(Math.random() * 100000).toString(),
      name,
      city,
      price: Number(price),
      rating: 0,
      description: description || "",
      image: image || "default_hotel.jpg",
      amenities:
        typeof amenities === "string"
          ? amenities.split(",").map((a) => a.trim())
          : Array.isArray(amenities)
          ? amenities
          : [],
      owner: {
        name: owner.name || "Unknown",
        email: owner.email || "unknown@example.com",
        phone: owner.phone || "",
        password: owner.password || "", // ✅ added
      },
      createdAt: new Date(),
    };

    const result = await db.collection("hotels").insertOne(newHotel);

    if (result.acknowledged) {
      res.json({
        success: true,
        message: "✅ Hotel added successfully!",
        hotel: { _id: result.insertedId, ...newHotel },
      });
    } else {
      res.status(500).json({
        success: false,
        message: "Failed to insert hotel into database.",
      });
    }
  } catch (error) {
    console.error("❌ Error adding hotel:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error while adding hotel.",
    });
  }

}); 

// ✅ Delete hotel (works with _id or hotelid)
app.delete("/delete-hotel/:id", async (req, res) => {
  try {
    const { id } = req.params;
    console.log("🧹 Delete request for hotel ID:", id);

    const queryOptions = [];
    if (ObjectId.isValid(id)) queryOptions.push({ _id: new ObjectId(id) });
    queryOptions.push({ hotelid: id });
    queryOptions.push({ hotelid: Number(id) });

    console.log("🔍 Query options for delete:", queryOptions);

    const result = await db.collection("hotels").deleteOne({
      $or: queryOptions,
    });

    if (result.deletedCount === 0) {
      console.warn("⚠️ No hotel found for given ID");
      return res
        .status(404)
        .json({ success: false, message: "Hotel not found" });
    }

    console.log("✅ Hotel deleted successfully!");
    res.json({ success: true, message: "Hotel deleted successfully" });
  } catch (error) {
    console.error("❌ Error deleting hotel:", error);
    res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
});




// ==============================
// 📊 ADMIN REPORTS ROUTE
// ==============================
app.get("/admin-reports", async (req, res) => {
  try {
    // --- Counts ---
    const usersCount = await db.collection("users").countDocuments();
    const hotelsCount = await db.collection("hotels").countDocuments();
    const bookingsCount = await db.collection("bookings").countDocuments();

    // --- Latest 5 Users ---
    const latestUsers = await db.collection("users")
      .find({}, { projection: { name: 1, email: 1, createdAt: 1 } })
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray();

    // --- Most Booked Hotels ---
    const mostBookedHotels = await db.collection("bookings").aggregate([
      { $group: { _id: "$hotelName", totalBookings: { $sum: 1 } } },
      { $sort: { totalBookings: -1 } },
      { $limit: 5 },
    ]).toArray();

    // --- Most Booked Room Types ---
    const mostBookedRooms = await db.collection("bookings").aggregate([
      { $group: { _id: "$roomType", totalBookings: { $sum: 1 } } },
      { $sort: { totalBookings: -1 } },
      { $limit: 5 },
    ]).toArray();

    // --- Newest Hotels ---
    const newHotels = await db.collection("hotels")
      .find({}, { projection: { name: 1, city: 1, createdAt: 1, rating: 1 } })
      .sort({ createdAt: -1 })
      .limit(5)
      .toArray();

    // --- Highest Rated Hotels ---
    const topRatedHotels = await db.collection("hotels")
      .find({ rating: { $gt: 0 } }, { projection: { name: 1, city: 1, rating: 1 } })
      .sort({ rating: -1 })
      .limit(5)
      .toArray();

    res.json({
      success: true,
      stats: {
        usersCount,
        hotelsCount,
        bookingsCount,
      },
      latestUsers,
      mostBookedHotels,
      mostBookedRooms,
      newHotels,
      topRatedHotels,
    });
  } catch (err) {
    console.error("❌ Error generating admin report:", err);
    res
      .status(500)
      .json({ success: false, message: "Server error generating report" });
  }
});




app.post("/book-room", async (req, res) => {
  try {
    const {
      roomId,
      userId,
      guestName,
      guestsCount,
      checkIn,
      checkOut,
      numRooms,
      hotelId,
      hotelName,
      email,
      phone,
    } = req.body;

    console.log("📩 Booking request received:", req.body);

    if (!roomId || !userId || !checkIn || !checkOut) {
      return res
        .status(400)
        .json({ success: false, message: "Missing booking details." });
    }

    // ✅ Find the room
    const room = await db.collection("rooms").findOne({ roomId: Number(roomId) });
    if (!room) {
      console.log("❌ Room not found:", roomId);
      return res
        .status(404)
        .json({ success: false, message: "Room not found" });
    }

    // ✅ Find the hotel
    const hotel =
      (await db
        .collection("hotels")
        .findOne({ hotelid: Number(room.hotelId) })) || null;

    // ✅ Prepare booking data
    const bookingData = {
      roomId: Number(roomId),
      hotelId: hotel ? hotel._id : null,
      hotelName: hotel ? hotel.name : hotelName || "Unknown Hotel",
      userId: new ObjectId(userId),
      guestName,
      guestsCount: Number(guestsCount),
      checkIn,
      checkOut,
      numRooms: Number(numRooms),
      email,
      phone,
      totalPrice: (room.price || 0) * (numRooms || 1),
      bookingStatus: "Confirmed",
      createdAt: new Date(),
    };

    console.log("🧾 Booking data before insert:", bookingData);

    // ✅ Insert booking first
    const bookingResult = await db.collection("bookings").insertOne(bookingData);
    console.log("✅ Booking inserted with ID:", bookingResult.insertedId);

    // ✅ Now create a related bill entry automatically
    const billData = {
      bookingId: bookingResult.insertedId, // 🔗 link to booking
      hotel: hotel ? { name: hotel.name, city: hotel.city } : { name: hotelName || "Unknown Hotel" },
      room: {
        roomId: room.roomId,
        roomType: room.roomType || "Standard",
        price: room.price || 0,
      },
      guestName,
      email,
      phone,
      checkIn,
      checkOut,
      numRooms: Number(numRooms),
      totalAmount: (room.price || 0) * (numRooms || 1),
      paymentStatus: "Pending",
      createdAt: new Date(),
    };

    await db.collection("bills").insertOne(billData);
    console.log("🧾 Bill created for booking:", bookingResult.insertedId);

    res.json({
      success: true,
      message: "✅ Booking and bill created successfully!",
      bookingId: bookingResult.insertedId,
      hotelName: bookingData.hotelName,
    });
  } catch (error) {
    console.error("❌ Error during booking:", error);
    res.status(500).json({
      success: false,
      message: "Server error during booking.",
      error: error.message,
    });
  }
});



app.get("/user-bookings/:id", async (req, res) => {
  try {
    const userId = req.params.id;

    const bookings = await db.collection("bookings")
      .find({ userId: userId })   // ✔ MATCH STRING
      .sort({ createdAt: -1 })
      .toArray();

    const stats = {
      total: bookings.length,
      upcoming: bookings.filter(b => b.bookingStatus === "Confirmed").length,
      cancelled: bookings.filter(b => b.bookingStatus === "Cancelled").length,
    };

    const recent = bookings.slice(0, 3);

    res.json({ success: true, stats, recent });

  } catch (error) {
    console.error("❌ Error in /user-bookings:", error);
    res.json({ success: false, message: "Error fetching user bookings" });
  }
});



// ==============================
// 🌐 START SERVER (MUST BE LAST)
// ==============================
const PORT = process.env.PORT || 5050;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

