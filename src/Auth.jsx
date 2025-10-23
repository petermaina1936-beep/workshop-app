import { useState } from "react";
import { auth } from "./firebaseConfig";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";

export default function Auth({ onAuth }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLogin, setIsLogin] = useState(true);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      let userCred;
      if (isLogin) {
        userCred = await signInWithEmailAndPassword(auth, email, password);
      } else {
        userCred = await createUserWithEmailAndPassword(auth, email, password);
      }
      onAuth(userCred.user);
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="p-4 max-w-xs mx-auto text-center">
      <h2 className="text-lg font-semibold mb-2">
        {isLogin ? "Login" : "Create Account"}
      </h2>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border p-2 rounded"
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="border p-2 rounded"
          required
        />
        <button className="bg-blue-600 text-white rounded py-2">
          {isLogin ? "Login" : "Sign Up"}
        </button>
      </form>
      <p
        onClick={() => setIsLogin(!isLogin)}
        className="text-sm text-blue-600 mt-2 cursor-pointer"
      >
        {isLogin
          ? "Need an account? Sign Up"
          : "Already have an account? Login"}
      </p>
    </div>
  );
}
